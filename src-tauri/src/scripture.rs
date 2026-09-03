use crate::document::write_bytes_atomic;
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DBS_ROOT: &str = "https://arc.dbs.org";
const CATALOG_LIMIT: usize = 8 * 1024 * 1024;
const CHAPTER_LIMIT: usize = 2 * 1024 * 1024;
const CATALOG_TTL_MS: u64 = 24 * 60 * 60 * 1_000;
const CHAPTER_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
const MAX_CHAPTER_FILES: usize = 192;
const MAX_CHAPTER_CACHE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbsResponse {
    pub body: String,
    pub cached: bool,
    pub stale: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CacheEntry {
    fetched_at_ms: u64,
    body: String,
}

#[derive(Clone)]
pub struct ScriptureClient {
    http: Client,
    cache_lock: Arc<Mutex<()>>,
}

impl ScriptureClient {
    pub fn new() -> Result<Self, String> {
        Client::builder()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(8))
            .user_agent("Verseform/0.1 (+https://github.com/SydFloyd/verseform)")
            .build()
            .map(|http| Self {
                http,
                cache_lock: Arc::new(Mutex::new(())),
            })
            .map_err(|_| "Verseform could not initialize secure DBS access.".into())
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn read_cache(path: &Path, body_limit: usize) -> Option<CacheEntry> {
    let bytes = fs::read(path).ok()?;
    if bytes.len() > body_limit + 65_536 {
        return None;
    }
    let entry: CacheEntry = serde_json::from_slice(&bytes).ok()?;
    (entry.body.len() <= body_limit).then_some(entry)
}

fn write_cache(path: &Path, entry: &CacheEntry) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "Verseform could not create its scripture cache.")?;
    }
    let bytes =
        serde_json::to_vec(entry).map_err(|_| "Verseform could not encode cached scripture.")?;
    write_bytes_atomic(path, &bytes)
        .map_err(|_| "Verseform could not update its scripture cache.".into())
}

fn request(client: &Client, url: &str, limit: usize) -> Result<String, String> {
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .map_err(|_| "DBS is unavailable. Check your connection and try again.")?;
    if !response.status().is_success() {
        return Err(format!("DBS returned HTTP {}.", response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("The DBS response exceeded Verseform's safety limit.".into());
    }
    let mut bytes =
        Vec::with_capacity(response.content_length().unwrap_or(0).min(limit as u64) as usize);
    response
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Verseform could not read the DBS response.")?;
    if bytes.len() > limit {
        return Err("The DBS response exceeded Verseform's safety limit.".into());
    }
    String::from_utf8(bytes).map_err(|_| "DBS returned text in an unsupported encoding.".into())
}

fn cached_request(
    client: &Client,
    path: &Path,
    url: &str,
    limit: usize,
    ttl_ms: u64,
    validate: impl Fn(&str) -> bool,
) -> Result<DbsResponse, String> {
    let cached = read_cache(path, limit).filter(|entry| validate(&entry.body));
    if let Some(entry) = cached.as_ref()
        && now_ms().saturating_sub(entry.fetched_at_ms) <= ttl_ms
    {
        return Ok(DbsResponse {
            body: entry.body.clone(),
            cached: true,
            stale: false,
        });
    }
    match request(client, url, limit) {
        Ok(body) => {
            if !validate(&body) {
                return cached.map_or_else(
                    || Err("DBS returned data that Verseform could not safely read.".into()),
                    |entry| {
                        Ok(DbsResponse {
                            body: entry.body,
                            cached: true,
                            stale: true,
                        })
                    },
                );
            }
            write_cache(
                path,
                &CacheEntry {
                    fetched_at_ms: now_ms(),
                    body: body.clone(),
                },
            )?;
            Ok(DbsResponse {
                body,
                cached: false,
                stale: false,
            })
        }
        Err(error) => cached.map_or(Err(error), |entry| {
            Ok(DbsResponse {
                body: entry.body,
                cached: true,
                stale: true,
            })
        }),
    }
}

fn valid_catalog(body: &str) -> bool {
    let Ok(Value::Array(items)) = serde_json::from_str(body) else {
        return false;
    };
    items.len() <= 6_000
        && items.iter().all(|item| {
            let Some(entry) = item.as_object() else {
                return false;
            };
            let Some(id) = entry.get("abbr").and_then(Value::as_str) else {
                return false;
            };
            let Some(title) = entry.get("title").and_then(Value::as_str) else {
                return false;
            };
            valid_identifier(id) && !title.trim().is_empty() && title.len() <= 240
        })
}

fn valid_chapter(body: &str, requested_chapter: u16) -> bool {
    let Ok(Value::Array(items)) = serde_json::from_str(body) else {
        return false;
    };
    if items.len() > 250 {
        return false;
    }
    let mut entry_count = 0_usize;
    items.iter().all(|item| {
        let Some(entry) = item.as_object() else {
            return false;
        };
        if entry.is_empty() {
            return false;
        }
        entry_count += entry.len();
        entry_count <= 250
            && entry.iter().all(|(key, value)| {
                let Value::String(text) = value else {
                    return false;
                };
                if text.trim().is_empty() || text.len() > 20_000 {
                    return false;
                }
                let Some((book_and_chapter, verse_and_part)) = key.split_once('.') else {
                    return false;
                };
                let verse_digits = verse_and_part
                    .trim_end_matches(|character: char| character.is_ascii_lowercase());
                valid_book_and_chapter(book_and_chapter, requested_chapter)
                    && verse_digits
                        .parse::<u16>()
                        .is_ok_and(|verse| verse > 0 && verse <= 250)
                    && verse_and_part.len().saturating_sub(verse_digits.len()) <= 1
            })
    })
}

fn valid_book_and_chapter(value: &str, requested_chapter: u16) -> bool {
    let bytes = value.as_bytes();
    let mut index = usize::from(
        bytes
            .first()
            .is_some_and(|byte| matches!(*byte, b'1'..=b'3')),
    );
    let letters_start = index;
    while index < bytes.len() && bytes[index].is_ascii_uppercase() && index - letters_start < 3 {
        index += 1;
    }
    let letter_count = index - letters_start;
    letter_count > 0
        && index < bytes.len()
        && bytes[index..].iter().all(u8::is_ascii_digit)
        && std::str::from_utf8(&bytes[index..])
            .ok()
            .and_then(|chapter| chapter.parse::<u16>().ok())
            == Some(requested_chapter)
}

fn cache_root(profile_root: &Path) -> PathBuf {
    profile_root.join("scripture-cache-v1")
}

fn prune_chapters(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut files: Vec<_> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            metadata.is_file().then_some((
                entry.path(),
                metadata.len(),
                metadata.modified().unwrap_or(UNIX_EPOCH),
            ))
        })
        .collect();
    files.sort_by_key(|(_, _, modified)| *modified);
    let mut bytes: u64 = files.iter().map(|(_, length, _)| length).sum();
    while files.len() > MAX_CHAPTER_FILES || bytes > MAX_CHAPTER_CACHE_BYTES {
        let (path, length, _) = files.remove(0);
        if fs::remove_file(path).is_ok() {
            bytes = bytes.saturating_sub(length);
        }
    }
}

pub fn get_catalog(client: &ScriptureClient, profile_root: &Path) -> Result<DbsResponse, String> {
    let _cache_guard = client
        .cache_lock
        .lock()
        .map_err(|_| "Verseform's scripture cache is temporarily unavailable.")?;
    cached_request(
        &client.http,
        &cache_root(profile_root).join("catalog.json"),
        &format!("{DBS_ROOT}/api/bible-text/"),
        CATALOG_LIMIT,
        CATALOG_TTL_MS,
        valid_catalog,
    )
}

pub fn get_chapter(
    client: &ScriptureClient,
    profile_root: &Path,
    translation_id: &str,
    book_id: &str,
    chapter: u16,
) -> Result<DbsResponse, String> {
    if !valid_identifier(translation_id)
        || !valid_identifier(book_id)
        || chapter == 0
        || chapter > 200
    {
        return Err("The scripture request was invalid.".into());
    }
    let _cache_guard = client
        .cache_lock
        .lock()
        .map_err(|_| "Verseform's scripture cache is temporarily unavailable.")?;
    let directory = cache_root(profile_root).join("chapters");
    let path = directory.join(format!("{translation_id}_{book_id}_{chapter}.json"));
    let response = cached_request(
        &client.http,
        &path,
        &format!("{DBS_ROOT}/api/bible-text/{translation_id}/{book_id}/{chapter}"),
        CHAPTER_LIMIT,
        CHAPTER_TTL_MS,
        |body| valid_chapter(body, chapter),
    )?;
    prune_chapters(&directory);
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_cannot_escape_the_cache_or_provider_origin() {
        for accepted in ["ENGWEB", "1CO", "abc-123_X"] {
            assert!(valid_identifier(accepted));
        }
        for rejected in ["", "../WEB", "ENG/WEB", "WEB?redirect", "a b"] {
            assert!(!valid_identifier(rejected));
        }
    }

    #[test]
    fn cache_entries_are_size_bounded_and_round_trip() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("chapter.json");
        let entry = CacheEntry {
            fetched_at_ms: 42,
            body: "[]".into(),
        };
        write_cache(&path, &entry).expect("write cache");
        let loaded = read_cache(&path, 16).expect("read cache");
        assert_eq!(loaded.fetched_at_ms, 42);
        assert_eq!(loaded.body, "[]");
        assert!(read_cache(&path, 1).is_none());
    }

    #[test]
    fn only_bounded_catalog_and_requested_chapter_shapes_are_cacheable() {
        assert!(valid_catalog(
            r#"[{"abbr":"ENGWEB","title":"World English Bible"}]"#
        ));
        assert!(!valid_catalog(r#"[{"abbr":"../WEB","title":"Unsafe"}]"#));
        assert!(valid_chapter(r#"[{"JN3.16a":"For God so loved"}]"#, 3));
        assert!(valid_chapter(
            r#"[{"JN3.16":"For God so loved","JN3.17":"God sent his Son"}]"#,
            3
        ));
        assert!(!valid_chapter(r#"[{"JN4.16":"wrong chapter"}]"#, 3));
        assert!(!valid_chapter(r#"[{"JN13.16":"ambiguous chapter"}]"#, 3));
        assert!(!valid_chapter(r#"[{"JN3.0":"invalid verse"}]"#, 3));
    }

    #[test]
    fn chapter_cache_pruning_enforces_the_file_bound() {
        let directory = tempfile::tempdir().expect("temp directory");
        for index in 0..(MAX_CHAPTER_FILES + 3) {
            fs::write(
                directory.path().join(format!("chapter-{index}.json")),
                b"[]",
            )
            .expect("write cache fixture");
        }
        prune_chapters(directory.path());
        assert_eq!(
            fs::read_dir(directory.path())
                .expect("read cache directory")
                .count(),
            MAX_CHAPTER_FILES
        );
    }

    #[test]
    #[ignore = "requires the public DBS service"]
    fn live_arc_transport_uses_no_credential_and_accepts_current_shapes() {
        let directory = tempfile::tempdir().expect("temp directory");
        let client = ScriptureClient::new().expect("HTTPS client");
        let catalog = get_catalog(&client, directory.path()).expect("live DBS catalog");
        assert!(valid_catalog(&catalog.body));
        let chapter =
            get_chapter(&client, directory.path(), "ENGWEB", "JHN", 3).expect("live DBS chapter");
        assert!(valid_chapter(&chapter.body, 3));
    }
}
