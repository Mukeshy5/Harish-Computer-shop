# Generate the JPEGs used by the website without changing the source photos.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDirectory = Join-Path $PSScriptRoot '..\Harish computer frontend\src\assets'
$outputDirectory = Join-Path $assetDirectory 'optimized'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
$parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
    [System.Drawing.Imaging.Encoder]::Quality, [long]72
)
try {
    foreach ($name in @('Computer & Laptop Store.jpeg', 'home.jpeg', 'Computer Accessories.jpeg', 'Printers & Office Equipment.jpeg', 'Repair & Technical Support.jpeg')) {
        $source = [System.Drawing.Image]::FromFile((Join-Path $assetDirectory $name))
        $bitmap = $null
        $graphics = $null
        try {
            $width = [Math]::Min(960, $source.Width)
            $height = [int][Math]::Round($source.Height * $width / $source.Width)
            $bitmap = [System.Drawing.Bitmap]::new($width, $height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($source, 0, 0, $width, $height)
            $target = Join-Path $outputDirectory $name
            $bitmap.Save($target, $encoder, $parameters)
            [PSCustomObject]@{ Image = $name; OriginalBytes = (Get-Item -LiteralPath (Join-Path $assetDirectory $name)).Length; OptimizedBytes = (Get-Item -LiteralPath $target).Length }
        } finally {
            if ($graphics) { $graphics.Dispose() }
            if ($bitmap) { $bitmap.Dispose() }
            $source.Dispose()
        }
    }
} finally {
    $parameters.Dispose()
}
