use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::WebviewWindow;
use tokio::sync::oneshot;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM, ICoreWebView2_7, ICoreWebView2_16,
    ICoreWebView2Environment6, ICoreWebView2PrintToPdfCompletedHandler,
    ICoreWebView2PrintToPdfCompletedHandler_Impl,
};
use windows::core::{HSTRING, Interface, implement};
use windows_core::BOOL;

const OUTPUT_TIMEOUT: Duration = Duration::from_secs(120);
type OutputSender = Arc<Mutex<Option<oneshot::Sender<Result<(), String>>>>>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPdf {
    pub path: String,
    pub display_name: String,
}

pub fn suggested_pdf_name(value: &str) -> String {
    let without_extension = value
        .strip_suffix(".verseform")
        .or_else(|| value.strip_suffix(".VERSEFORM"))
        .unwrap_or(value);
    let sanitized: String = without_extension
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();
    let stem = sanitized.trim().trim_end_matches(['.', ' ']);
    format!("{}.pdf", if stem.is_empty() { "Verseform" } else { stem })
}

pub fn validate_pdf_destination(mut path: PathBuf) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("The PDF destination must be an absolute local path.".into());
    }
    if path.is_dir() {
        return Err("The selected PDF destination is a folder.".into());
    }
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("pdf"))
    {
        path.set_extension("pdf");
    }
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "The selected PDF destination has no parent folder.".to_owned())?;
    if !parent.is_dir() {
        return Err("The selected PDF destination folder does not exist.".into());
    }
    Ok(path)
}

pub fn saved_pdf(path: &Path) -> SavedPdf {
    SavedPdf {
        path: path.display().to_string(),
        display_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Verseform.pdf")
            .to_owned(),
    }
}

fn complete(sender: &OutputSender, result: Result<(), String>) {
    if let Ok(mut guard) = sender.lock()
        && let Some(sender) = guard.take()
    {
        let _ = sender.send(result);
    }
}

async fn await_output(receiver: oneshot::Receiver<Result<(), String>>) -> Result<(), String> {
    match tokio::time::timeout(OUTPUT_TIMEOUT, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("The WebView2 output operation ended unexpectedly.".into()),
        Err(_) => Err("The WebView2 output operation timed out.".into()),
    }
}

pub async fn show_system_print_dialog(window: WebviewWindow) -> Result<(), String> {
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let closure_sender = Arc::clone(&sender);
    window
        .with_webview(move |webview| unsafe {
            let result = webview
                .controller()
                .CoreWebView2()
                .and_then(|webview| webview.cast::<ICoreWebView2_16>())
                .and_then(|webview| webview.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))
                .map_err(|error| {
                    format!("Windows could not open the system print dialog: {error}")
                });
            complete(&closure_sender, result);
        })
        .map_err(|error| error.to_string())?;
    await_output(receiver).await
}

#[implement(ICoreWebView2PrintToPdfCompletedHandler)]
struct PdfCompletedHandler {
    sender: OutputSender,
}

impl ICoreWebView2PrintToPdfCompletedHandler_Impl for PdfCompletedHandler_Impl {
    fn Invoke(
        &self,
        error_code: windows::core::HRESULT,
        successful: BOOL,
    ) -> windows::core::Result<()> {
        let result = if error_code.is_err() {
            Err(format!("WebView2 could not write the PDF: {error_code:?}"))
        } else if !successful.as_bool() {
            Err("WebView2 could not write the selected PDF destination.".into())
        } else {
            Ok(())
        };
        complete(&self.sender, result);
        Ok(())
    }
}

pub async fn export_pdf(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    let path = validate_pdf_destination(path)?;
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let closure_sender = Arc::clone(&sender);
    window
        .with_webview(move |webview| unsafe {
            let start = (|| -> windows::core::Result<()> {
                let webview = webview.controller().CoreWebView2()?;
                let webview: ICoreWebView2_7 = webview.cast()?;
                let environment: ICoreWebView2Environment6 = webview.Environment()?.cast()?;
                let settings = environment.CreatePrintSettings()?;
                settings.SetPageWidth(8.5)?;
                settings.SetPageHeight(11.0)?;
                settings.SetMarginTop(0.75)?;
                settings.SetMarginBottom(1.5)?;
                settings.SetMarginLeft(0.75)?;
                settings.SetMarginRight(0.75)?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                let handler: ICoreWebView2PrintToPdfCompletedHandler = PdfCompletedHandler {
                    sender: Arc::clone(&closure_sender),
                }
                .into();
                let destination = HSTRING::from(path.display().to_string());
                webview.PrintToPdf(&destination, &settings, &handler)
            })();
            if let Err(error) = start {
                complete(
                    &closure_sender,
                    Err(format!("Windows could not start PDF export: {error}")),
                );
            }
        })
        .map_err(|error| error.to_string())?;
    await_output(receiver).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn pdf_names_are_safe_and_keep_the_pdf_extension() {
        assert_eq!(suggested_pdf_name("Sermon.verseform"), "Sermon.pdf");
        assert_eq!(suggested_pdf_name("Sunday: John 3?"), "Sunday- John 3-.pdf");
        assert_eq!(suggested_pdf_name("..."), "Verseform.pdf");
    }

    #[test]
    fn pdf_destinations_are_absolute_existing_local_folders() {
        let directory = tempdir().expect("temporary directory");
        let selected = directory.path().join("sermon");
        assert_eq!(
            validate_pdf_destination(selected).unwrap(),
            directory.path().join("sermon.pdf")
        );
        assert!(validate_pdf_destination(PathBuf::from("relative.pdf")).is_err());
        assert!(validate_pdf_destination(directory.path().to_path_buf()).is_err());
        assert!(
            validate_pdf_destination(directory.path().join("missing").join("sermon.pdf")).is_err()
        );
    }
}
