#![cfg(windows)]

use serde_json::json;
use tempfile::tempdir;
use verseform_lib::document::{DocumentEnvelope, open_document, save_atomic};
use verseform_lib::output::WEBVIEW2_PRINT_SCRIPT;
use verseform_lib::storage::{
    RecoverySnapshot, discard_recovery_snapshot, list_recent, list_recovery_snapshots,
    preferred_translation, record_recent, set_preferred_translation, write_recovery_snapshot,
};

fn fixture(text: &str) -> DocumentEnvelope {
    DocumentEnvelope {
        format: "verseform".into(),
        schema_version: 2,
        title: Some("Walking document".into()),
        document_id: "vfm-010-smoke".into(),
        created_at: "2026-09-02T12:00:00.000Z".into(),
        updated_at: "2026-09-02T12:00:01.000Z".into(),
        content: json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": text}]
            }]
        }),
    }
}

#[test]
fn atomically_saves_replaces_and_reopens_a_verseform_file() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("walking.verseform");
    save_atomic(&path, &fixture("first")).expect("initial atomic save");
    save_atomic(&path, &fixture("second")).expect("atomic replacement");

    let reopened = open_document(&path).expect("reopen saved document");
    assert_eq!(reopened, fixture("second"));
    assert_eq!(
        std::fs::read_dir(directory.path())
            .expect("list directory")
            .count(),
        1,
        "no sibling temporary file remains"
    );
}

#[test]
fn invalid_save_cannot_overwrite_the_last_good_document() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("walking.verseform");
    let accepted = fixture("accepted work");
    save_atomic(&path, &accepted).expect("save accepted document");

    let mut invalid = fixture("discard me");
    invalid.schema_version = 999;
    assert!(save_atomic(&path, &invalid).is_err());
    assert_eq!(open_document(&path).expect("original survives"), accepted);
}

#[test]
fn corrupt_and_newer_documents_fail_without_changing_their_bytes() {
    let directory = tempdir().expect("temporary directory");
    let corrupt_path = directory.path().join("corrupt.verseform");
    std::fs::write(&corrupt_path, b"not json").expect("write corrupt fixture");
    let before = std::fs::read(&corrupt_path).expect("read fixture");
    assert!(open_document(&corrupt_path).is_err());
    assert_eq!(
        std::fs::read(&corrupt_path).expect("reread fixture"),
        before
    );

    let newer_path = directory.path().join("newer.verseform");
    let mut newer = fixture("future");
    newer.schema_version = 999;
    std::fs::write(&newer_path, serde_json::to_vec_pretty(&newer).unwrap()).unwrap();
    let before = std::fs::read(&newer_path).unwrap();
    assert!(open_document(&newer_path).is_err());
    assert_eq!(std::fs::read(&newer_path).unwrap(), before);
}

#[test]
fn profile_recents_and_recovery_survive_a_fresh_storage_read() {
    let directory = tempdir().expect("temporary directory");
    let profile_root = directory.path().join("profile");
    let document_path = directory.path().join("kept.verseform");
    let document = fixture("accepted recovery");
    save_atomic(&document_path, &document).expect("save document");
    set_preferred_translation(&profile_root, "ENGWEB").expect("save translation preference");
    record_recent(&profile_root, &document_path).expect("record recent");

    let snapshot = RecoverySnapshot {
        document: document.clone(),
        source_path: None,
        saved_content_hash: Some("before".into()),
        content_hash: "after".into(),
        captured_at_ms: 42,
    };
    write_recovery_snapshot(&profile_root, &snapshot).expect("write recovery");

    assert_eq!(list_recent(&profile_root).len(), 1);
    assert_eq!(
        preferred_translation(&profile_root).as_deref(),
        Some("ENGWEB")
    );
    assert_eq!(
        list_recovery_snapshots(&profile_root).unwrap(),
        vec![snapshot.clone()]
    );
    discard_recovery_snapshot(&profile_root, &document.document_id).unwrap();
    assert!(list_recovery_snapshots(&profile_root).unwrap().is_empty());

    let mut already_saved = snapshot;
    already_saved.source_path = Some(document_path.display().to_string());
    write_recovery_snapshot(&profile_root, &already_saved).expect("write synchronized recovery");
    assert!(
        list_recovery_snapshots(&profile_root).unwrap().is_empty(),
        "a recovery no newer than its saved source is not offered"
    );

    std::fs::remove_file(document_path).unwrap();
    assert!(
        list_recent(&profile_root).is_empty(),
        "missing recent files are harmless"
    );
}

#[test]
fn windows_output_route_targets_the_installed_webview2_runtime() {
    let version = tauri::webview_version().expect("WebView2 Runtime must be installed");
    assert!(!version.trim().is_empty());
    assert_eq!(WEBVIEW2_PRINT_SCRIPT, "window.print()");
}
