pub const WEBVIEW2_PRINT_SCRIPT: &str = "window.print()";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_adapter_selects_the_webview_print_dialog() {
        assert_eq!(WEBVIEW2_PRINT_SCRIPT, "window.print()");
    }
}
