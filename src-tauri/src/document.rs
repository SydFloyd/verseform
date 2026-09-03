use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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
    let Some(node) = value.as_object() else {
        return false;
    };
    let Some(node_type) = node.get("type").and_then(Value::as_str) else {
        return false;
    };
    if node_type == "text" && node.get("text").and_then(Value::as_str).is_none() {
        return false;
    }
    if let Some(content) = node.get("content") {
        let Some(children) = content.as_array() else {
            return false;
        };
        if !children.iter().all(valid_node) {
            return false;
        }
    }
    if let Some(marks) = node.get("marks") {
        let Some(marks) = marks.as_array() else {
            return false;
        };
        if !marks.iter().all(|mark| {
            mark.as_object()
                .and_then(|object| object.get("type"))
                .and_then(Value::as_str)
                .is_some()
        }) {
            return false;
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

pub fn write_bytes_atomic(destination: &Path, bytes: &[u8]) -> io::Result<()> {
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
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temporary, destination)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

pub fn save_atomic(destination: &Path, document: &DocumentEnvelope) -> io::Result<()> {
    document.validate_for_save()?;
    let mut serialized = serde_json::to_vec_pretty(document)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    serialized.push(b'\n');
    write_bytes_atomic(destination, &serialized)
}

pub fn open_document(path: &Path) -> io::Result<DocumentEnvelope> {
    if fs::metadata(path)?.len() > 10 * 1024 * 1024 {
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
