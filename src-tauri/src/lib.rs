pub mod document;
pub mod output;
pub mod scripture;
pub mod storage;

use document::DocumentEnvelope;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use storage::{OpenedDocument, RecentDocument, RecoverySnapshot, SavedDocument};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct DocumentSession(Mutex<HashSet<PathBuf>>);

fn profile_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn require_verseform_extension(path: &Path) -> Result<(), String> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("verseform"))
    {
        Ok(())
    } else {
        Err("Verseform documents must use the .verseform extension.".into())
    }
}

fn grant(session: &State<'_, DocumentSession>, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    session
        .0
        .lock()
        .map_err(|_| "document session lock failed")?
        .insert(canonical.clone());
    Ok(canonical)
}

fn is_granted(session: &State<'_, DocumentSession>, path: &Path) -> Result<bool, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    Ok(session
        .0
        .lock()
        .map_err(|_| "document session lock failed")?
        .contains(&canonical))
}

fn open_at_path(
    app: &tauri::AppHandle,
    session: &State<'_, DocumentSession>,
    path: &Path,
) -> Result<OpenedDocument, String> {
    require_verseform_extension(path)?;
    let document = document::open_document(path).map_err(|error| error.to_string())?;
    let canonical = grant(session, path)?;
    let saved = storage::record_recent(&profile_root(app)?, &canonical)
        .map_err(|error| error.to_string())?;
    Ok(OpenedDocument {
        document,
        path: saved.path,
        display_name: saved.display_name,
    })
}

#[tauri::command]
async fn open_document_dialog(
    app: tauri::AppHandle,
    session: State<'_, DocumentSession>,
) -> Result<Option<OpenedDocument>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Verseform document", &["verseform"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "Only local files can be opened.")?;
    open_at_path(&app, &session, &path).map(Some)
}

#[tauri::command]
async fn save_document_as_dialog(
    app: tauri::AppHandle,
    session: State<'_, DocumentSession>,
    document: DocumentEnvelope,
    suggested_name: String,
) -> Result<Option<SavedDocument>, String> {
    document
        .validate_for_save()
        .map_err(|error| error.to_string())?;
    let selected = app
        .dialog()
        .file()
        .add_filter("Verseform document", &["verseform"])
        .set_file_name(
            if suggested_name.to_ascii_lowercase().ends_with(".verseform") {
                suggested_name
            } else {
                format!("{suggested_name}.verseform")
            },
        )
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let mut path = selected
        .into_path()
        .map_err(|_| "Only local files can be saved.")?;
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("verseform"))
    {
        path.set_extension("verseform");
    }
    document::save_atomic(&path, &document).map_err(|error| error.to_string())?;
    let canonical = grant(&session, &path)?;
    storage::record_recent(&profile_root(&app)?, &canonical)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_document_path(
    app: tauri::AppHandle,
    session: State<'_, DocumentSession>,
    path: String,
    document: DocumentEnvelope,
) -> Result<SavedDocument, String> {
    let path = PathBuf::from(path);
    require_verseform_extension(&path)?;
    if !is_granted(&session, &path)? && !storage::is_recent_grant(&profile_root(&app)?, &path) {
        return Err("That document path is not granted for this session.".into());
    }
    document::save_atomic(&path, &document).map_err(|error| error.to_string())?;
    storage::record_recent(&profile_root(&app)?, &path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_recent_document(
    app: tauri::AppHandle,
    session: State<'_, DocumentSession>,
    path: String,
) -> Result<OpenedDocument, String> {
    let path = PathBuf::from(path);
    if !storage::is_recent_grant(&profile_root(&app)?, &path) {
        return Err("That path is not in Verseform's recent documents.".into());
    }
    open_at_path(&app, &session, &path)
}

#[tauri::command]
fn list_recent_documents(app: tauri::AppHandle) -> Result<Vec<RecentDocument>, String> {
    Ok(storage::list_recent(&profile_root(&app)?))
}

#[tauri::command]
fn write_recovery(app: tauri::AppHandle, snapshot: RecoverySnapshot) -> Result<(), String> {
    storage::write_recovery_snapshot(&profile_root(&app)?, &snapshot)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_recoveries(app: tauri::AppHandle) -> Result<Vec<RecoverySnapshot>, String> {
    storage::list_recovery_snapshots(&profile_root(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn discard_recovery(app: tauri::AppHandle, document_id: String) -> Result<(), String> {
    storage::discard_recovery_snapshot(&profile_root(&app)?, &document_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_preferred_translation(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(storage::preferred_translation(&profile_root(&app)?))
}

#[tauri::command]
fn set_preferred_translation(app: tauri::AppHandle, translation_id: String) -> Result<(), String> {
    storage::set_preferred_translation(&profile_root(&app)?, &translation_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn dbs_get_catalog(
    app: tauri::AppHandle,
    client: State<'_, scripture::ScriptureClient>,
) -> Result<scripture::DbsResponse, String> {
    let root = profile_root(&app)?;
    let client = client.inner().clone();
    tauri::async_runtime::spawn_blocking(move || scripture::get_catalog(&client, &root))
        .await
        .map_err(|_| "The DBS catalog task ended unexpectedly.".to_owned())?
}

#[tauri::command]
async fn dbs_get_chapter(
    app: tauri::AppHandle,
    client: State<'_, scripture::ScriptureClient>,
    translation_id: String,
    book_id: String,
    chapter: u16,
) -> Result<scripture::DbsResponse, String> {
    let root = profile_root(&app)?;
    let client = client.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        scripture::get_chapter(&client, &root, &translation_id, &book_id, chapter)
    })
    .await
    .map_err(|_| "The DBS passage task ended unexpectedly.".to_owned())?
}

#[tauri::command]
async fn show_print_dialog(window: WebviewWindow) -> Result<(), String> {
    output::show_system_print_dialog(window).await
}

#[tauri::command]
async fn export_pdf_dialog(
    app: tauri::AppHandle,
    window: WebviewWindow,
    suggested_name: String,
) -> Result<Option<output::SavedPdf>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("PDF document", &["pdf"])
        .set_file_name(output::suggested_pdf_name(&suggested_name))
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "Only a local PDF destination can be selected.")?;
    let path = output::validate_pdf_destination(path)?;
    output::export_pdf(window, path.clone()).await?;
    Ok(Some(output::saved_pdf(&path)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let scripture_client = scripture::ScriptureClient::new()
        .expect("Verseform could not initialize secure DBS access");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DocumentSession::default())
        .manage(scripture_client)
        .invoke_handler(tauri::generate_handler![
            open_document_dialog,
            save_document_as_dialog,
            save_document_path,
            open_recent_document,
            list_recent_documents,
            write_recovery,
            list_recoveries,
            discard_recovery,
            get_preferred_translation,
            set_preferred_translation,
            dbs_get_catalog,
            dbs_get_chapter,
            show_print_dialog,
            export_pdf_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running Verseform");
}
