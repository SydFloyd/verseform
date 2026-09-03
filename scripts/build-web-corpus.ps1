param(
    [Parameter(Mandatory = $true)][string]$SourceXml,
    [string]$OutputPath = "src/assets/web-corpus.json"
)

$ErrorActionPreference = "Stop"
$resolvedSource = (Resolve-Path -LiteralPath $SourceXml).Path
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$reader = [System.Xml.XmlReader]::Create($resolvedSource, $settings)
$books = [ordered]@{}
$allowedBooks = [System.Collections.Generic.HashSet[string]]::new([string[]]@(
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"
))
$currentBook = $null
$currentChapter = 0
$currentVerse = 0
$verseText = $null
$excludedDepth = -1

try {
    while ($reader.Read()) {
        if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element) {
            if ($reader.LocalName -eq "book") {
                $bookId = $reader.GetAttribute("id")
                $currentBook = if ($allowedBooks.Contains($bookId)) { $bookId } else { $null }
                if ($currentBook) { $books[$currentBook] = [System.Collections.ArrayList]::new() }
            } elseif ($reader.LocalName -eq "c" -and $currentBook) {
                $currentChapter = [int]$reader.GetAttribute("id")
                $chapters = $books[$currentBook]
                while ($chapters.Count -lt $currentChapter) { [void]$chapters.Add([System.Collections.ArrayList]::new()) }
            } elseif ($reader.LocalName -eq "v" -and $currentBook) {
                $currentVerse = [int]$reader.GetAttribute("id")
                $verseText = [System.Text.StringBuilder]::new()
            } elseif ($reader.LocalName -eq "ve" -and $verseText) {
                $normalized = [regex]::Replace($verseText.ToString(), "\s+", " ").Trim()
                $verses = $books[$currentBook][$currentChapter - 1]
                while ($verses.Count -lt $currentVerse) { [void]$verses.Add("") }
                $verses[$currentVerse - 1] = $normalized
                $verseText = $null
                $currentVerse = 0
            } elseif (($reader.LocalName -eq "f" -or $reader.LocalName -eq "x") -and -not $reader.IsEmptyElement) {
                $excludedDepth = $reader.Depth
            }
        } elseif ($reader.NodeType -eq [System.Xml.XmlNodeType]::EndElement) {
            if ($excludedDepth -ge 0 -and $reader.Depth -eq $excludedDepth) { $excludedDepth = -1 }
        } elseif ($verseText -and $excludedDepth -lt 0 -and (
            $reader.NodeType -eq [System.Xml.XmlNodeType]::Text -or
            $reader.NodeType -eq [System.Xml.XmlNodeType]::CDATA -or
            $reader.NodeType -eq [System.Xml.XmlNodeType]::Whitespace -or
            $reader.NodeType -eq [System.Xml.XmlNodeType]::SignificantWhitespace
        )) {
            [void]$verseText.Append($reader.Value)
        }
    }
} finally {
    $reader.Dispose()
}

$corpus = [ordered]@{
    version = 1
    edition = "World English Bible, 2020 stable text, 66-book protocanon"
    source = "https://ebible.org/Scriptures/engwebp_usfx.zip"
    books = $books
}
$json = $corpus | ConvertTo-Json -Depth 8 -Compress
$output = Join-Path (Get-Location) $OutputPath
$directory = Split-Path -Parent $output
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
[System.IO.File]::WriteAllText($output, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output "Wrote $($books.Count) books to $output"
