use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_DOCUMENT_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_DOCUMENT_TEXT_CHARACTERS: usize = 1_000_000;
pub const MAX_DOCUMENT_NODES: usize = 50_000;
pub const MAX_DOCUMENT_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentEnvelope {
    pub format: String,
    pub schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub document_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub content: Value,
}

fn valid_node(value: &Value) -> bool {
    let mut pending = vec![(value, 1_usize)];
    let mut node_count = 0_usize;
    let mut text_characters = 0_usize;
    while let Some((current, depth)) = pending.pop() {
        let Some(node) = current.as_object() else {
            return false;
        };
        let Some(node_type) = node.get("type").and_then(Value::as_str) else {
            return false;
        };
        if depth > MAX_DOCUMENT_DEPTH {
            return false;
        }
        node_count += 1;
        if node_count > MAX_DOCUMENT_NODES {
            return false;
        }
        if node_type == "text" && node.get("text").and_then(Value::as_str).is_none() {
            return false;
        }
        if let Some(text) = node.get("text") {
            let Some(text) = text.as_str() else {
                return false;
            };
            text_characters += text.encode_utf16().count();
            if text_characters > MAX_DOCUMENT_TEXT_CHARACTERS {
                return false;
            }
        }
        if node.get("attrs").is_some_and(|attrs| !attrs.is_object()) {
            return false;
        }
        if let Some(content) = node.get("content") {
            let Some(children) = content.as_array() else {
                return false;
            };
            pending.extend(children.iter().rev().map(|child| (child, depth + 1)));
        }
        if let Some(marks) = node.get("marks") {
            let Some(marks) = marks.as_array() else {
                return false;
            };
            if !marks.iter().all(|mark| {
                mark.as_object().is_some_and(|object| {
                    object.get("type").and_then(Value::as_str).is_some()
                        && object.get("attrs").is_none_or(Value::is_object)
                })
            }) {
                return false;
            }
        }
    }
    true
}

impl DocumentEnvelope {
    pub fn validate_for_open(&self) -> io::Result<()> {
        let root_is_doc = self
            .content
            .as_object()
            .and_then(|node| node.get("type"))
            .and_then(Value::as_str)
            == Some("doc");
        if self.format != "verseform"
            || !matches!(self.schema_version, 1 | 2)
            || (self.schema_version == 2
                && self
                    .title
                    .as_deref()
                    .is_none_or(|title| title.trim().is_empty()))
            || self.document_id.trim().is_empty()
            || self.created_at.trim().is_empty()
            || self.updated_at.trim().is_empty()
            || !root_is_doc
            || !valid_node(&self.content)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "unsupported or invalid Verseform document",
            ));
        }
        Ok(())
    }

    pub fn validate_for_save(&self) -> io::Result<()> {
        self.validate_for_open()?;
        if self.schema_version != 2 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "only the current Verseform schema can be saved",
            ));
        }
        Ok(())
    }
}

fn temporary_path(destination: &Path, attempt: u32) -> io::Result<PathBuf> {
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid destination name"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    Ok(destination.with_file_name(format!(
        ".{name}.{}.{}.{}.tmp",
        std::process::id(),
        nonce,
        attempt
    )))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source_wide: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

fn write_bytes_atomic_with<F>(destination: &Path, write: F) -> io::Result<()>
where
    F: FnOnce(&mut std::fs::File) -> io::Result<()>,
{
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "destination has no parent"))?;
    if !parent.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "destination directory does not exist",
        ));
    }

    let (temporary, mut file) = {
        let mut selected = None;
        for attempt in 0..32 {
            let path = temporary_path(destination, attempt)?;
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => {
                    selected = Some((path, file));
                    break;
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        selected.ok_or_else(|| {
            io::Error::new(io::ErrorKind::AlreadyExists, "no temporary name available")
        })?
    };

    let write_result = (|| {
        write(&mut file)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temporary, destination)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

pub fn write_bytes_atomic(destination: &Path, bytes: &[u8]) -> io::Result<()> {
    write_bytes_atomic_with(destination, |file| file.write_all(bytes))
}

pub fn save_atomic(destination: &Path, document: &DocumentEnvelope) -> io::Result<()> {
    document.validate_for_save()?;
    let mut serialized = serde_json::to_vec_pretty(document)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    serialized.push(b'\n');
    if serialized.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "document exceeds 10 MiB",
        ));
    }
    write_bytes_atomic(destination, &serialized)
}

pub fn open_document(path: &Path) -> io::Result<DocumentEnvelope> {
    if fs::metadata(path)?.len() > MAX_DOCUMENT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "document exceeds 10 MiB",
        ));
    }
    let bytes = fs::read(path)?;
    let document: DocumentEnvelope = serde_json::from_slice(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    document.validate_for_open()?;
    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn interrupted_or_full_write_preserves_the_last_good_file_and_cleans_up() {
        let directory = tempdir().expect("temporary directory");
        let destination = directory.path().join("kept.verseform");
        fs::write(&destination, b"accepted work").expect("seed destination");

        let error = write_bytes_atomic_with(&destination, |file| {
            file.write_all(b"partial replacement")?;
            Err(io::Error::other("simulated storage full"))
        })
        .expect_err("simulated write must fail");

        assert_eq!(error.kind(), io::ErrorKind::Other);
        assert_eq!(fs::read(&destination).unwrap(), b"accepted work");
        assert_eq!(
            fs::read_dir(directory.path()).unwrap().count(),
            1,
            "failed temporary write must be removed"
        );
    }
}
