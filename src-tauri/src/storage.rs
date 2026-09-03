use crate::document::{DocumentEnvelope, write_bytes_atomic};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static PROFILE_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDocument {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    pub document: DocumentEnvelope,
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentDocument {
    pub path: String,
    pub display_name: String,
    pub last_opened_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Profile {
    recent_documents: Vec<RecentDocument>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    preferred_translation: Option<String>,
}

pub fn preferred_translation(root: &Path) -> Option<String> {
    load_profile(root).preferred_translation
}

pub fn set_preferred_translation(root: &Path, translation_id: &str) -> io::Result<()> {
    if translation_id.is_empty()
        || translation_id.len() > 64
        || !translation_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid translation identifier",
        ));
    }
    let _guard = PROFILE_WRITE_LOCK
        .lock()
        .map_err(|_| io::Error::other("profile write lock failed"))?;
    let mut profile = load_profile(root);
    profile.preferred_translation = Some(translation_id.to_owned());
    save_profile(root, &profile)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub document: DocumentEnvelope,
    pub source_path: Option<String>,
    pub saved_content_hash: Option<String>,
    pub content_hash: String,
    pub captured_at_ms: u64,
}

fn milliseconds_since_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn profile_path(root: &Path) -> PathBuf {
    root.join("profile.json")
}

fn load_profile(root: &Path) -> Profile {
    fs::read(profile_path(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_profile(root: &Path, profile: &Profile) -> io::Result<()> {
    fs::create_dir_all(root)?;
    let mut bytes = serde_json::to_vec_pretty(profile)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    bytes.push(b'\n');
    write_bytes_atomic(&profile_path(root), &bytes)
}

fn display_name(path: &Path) -> io::Result<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid document name"))
}

pub fn record_recent(root: &Path, path: &Path) -> io::Result<SavedDocument> {
    let canonical = path.canonicalize()?;
    let saved = SavedDocument {
        path: canonical.display().to_string(),
        display_name: display_name(&canonical)?,
    };
    let _guard = PROFILE_WRITE_LOCK
        .lock()
        .map_err(|_| io::Error::other("profile write lock failed"))?;
    let mut profile = load_profile(root);
    profile
        .recent_documents
        .retain(|item| item.path != saved.path);
    profile.recent_documents.insert(
        0,
        RecentDocument {
            path: saved.path.clone(),
            display_name: saved.display_name.clone(),
            last_opened_at_ms: milliseconds_since_epoch(),
        },
    );
    profile.recent_documents.truncate(10);
    save_profile(root, &profile)?;
    Ok(saved)
}

pub fn list_recent(root: &Path) -> Vec<RecentDocument> {
    load_profile(root)
        .recent_documents
        .into_iter()
        .filter(|item| Path::new(&item.path).is_file())
        .collect()
}

pub fn is_recent_grant(root: &Path, path: &Path) -> bool {
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    list_recent(root)
        .iter()
        .any(|item| Path::new(&item.path) == canonical)
}

fn recovery_file(root: &Path, document_id: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    document_id.hash(&mut hasher);
    root.join("recovery")
        .join(format!("{:016x}.json", hasher.finish()))
}

pub fn write_recovery_snapshot(root: &Path, snapshot: &RecoverySnapshot) -> io::Result<()> {
    snapshot.document.validate_for_save()?;
    let directory = root.join("recovery");
    fs::create_dir_all(&directory)?;
    let mut bytes = serde_json::to_vec_pretty(snapshot)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    bytes.push(b'\n');
    write_bytes_atomic(&recovery_file(root, &snapshot.document.document_id), &bytes)
}

pub fn list_recovery_snapshots(root: &Path) -> io::Result<Vec<RecoverySnapshot>> {
    let directory = root.join("recovery");
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        let Ok(snapshot) = serde_json::from_slice::<RecoverySnapshot>(&bytes) else {
            continue;
        };
        if snapshot.document.validate_for_open().is_err() {
            continue;
        }
        if let Some(source_path) = snapshot.source_path.as_deref()
            && let Ok(saved) = crate::document::open_document(Path::new(source_path))
            && saved.document_id == snapshot.document.document_id
            && saved.updated_at >= snapshot.document.updated_at
        {
            continue;
        }
        snapshots.push(snapshot);
    }
    snapshots.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.captured_at_ms));
    Ok(snapshots)
}

pub fn discard_recovery_snapshot(root: &Path, document_id: &str) -> io::Result<()> {
    let path = recovery_file(root, document_id);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
