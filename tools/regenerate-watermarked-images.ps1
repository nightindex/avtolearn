param(
  [string]$Root = "public/assets",
  [string]$Watermark = "autolearn"
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function Get-ImageSize($Path) {
  $img = [System.Drawing.Image]::FromFile($Path)
  try {
    return @{ Width = [Math]::Max(320, $img.Width); Height = [Math]::Max(220, $img.Height) }
  } finally {
    $img.Dispose()
  }
}

function New-Brush($Color) {
  return New-Object System.Drawing.SolidBrush $Color
}

function Draw-RoadScene($Graphics, $Width, $Height, $Seed, $Watermark) {
  $rand = New-Object System.Random $Seed
  $palette = @(
    @{ Sky1 = "#e7f5ff"; Sky2 = "#b6e0ff"; Ground = "#88c27a"; Road = "#495057"; Accent = "#1c7ed6" },
    @{ Sky1 = "#fff4e6"; Sky2 = "#ffd8a8"; Ground = "#8fc09a"; Road = "#343a40"; Accent = "#f08c00" },
    @{ Sky1 = "#edf2ff"; Sky2 = "#bac8ff"; Ground = "#74b49b"; Road = "#3b4652"; Accent = "#2f9e44" },
    @{ Sky1 = "#e6fcf5"; Sky2 = "#96f2d7"; Ground = "#7bb661"; Road = "#36454f"; Accent = "#d6336c" }
  )[$Seed % 4]

  $rect = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
  $skyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml($palette.Sky1)), ([System.Drawing.ColorTranslator]::FromHtml($palette.Sky2)), 90
  $Graphics.FillRectangle($skyBrush, $rect)
  $skyBrush.Dispose()

  $groundY = [int]($Height * 0.58)
  $groundBrush = New-Brush ([System.Drawing.ColorTranslator]::FromHtml($palette.Ground))
  $Graphics.FillRectangle($groundBrush, 0, $groundY, $Width, $Height - $groundY)
  $groundBrush.Dispose()

  $roadPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $roadPath.AddPolygon(@(
    (New-Object System.Drawing.PointF ([float]($Width * 0.40)), ([float]$groundY)),
    (New-Object System.Drawing.PointF ([float]($Width * 0.60)), ([float]$groundY)),
    (New-Object System.Drawing.PointF ([float]($Width * 0.88)), ([float]$Height)),
    (New-Object System.Drawing.PointF ([float]($Width * 0.12)), ([float]$Height))
  ))
  $roadBrush = New-Brush ([System.Drawing.ColorTranslator]::FromHtml($palette.Road))
  $Graphics.FillPath($roadBrush, $roadPath)
  $roadBrush.Dispose()
  $roadPath.Dispose()

  $lanePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 255, 255)), ([Math]::Max(3, $Width / 160))
  $dashCount = 5
  for ($i = 0; $i -lt $dashCount; $i++) {
    $y1 = $groundY + (($Height - $groundY) / $dashCount) * $i + 12
    $y2 = $y1 + (($Height - $groundY) / ($dashCount * 2))
    $Graphics.DrawLine($lanePen, [int]($Width * 0.5), [int]$y1, [int]($Width * 0.5), [int]$y2)
  }
  $lanePen.Dispose()

  $signBrush = New-Brush ([System.Drawing.ColorTranslator]::FromHtml($palette.Accent))
  $whiteBrush = New-Brush ([System.Drawing.Color]::White)
  $signSize = [int]([Math]::Min($Width, $Height) * 0.16)
  $signX = [int]($Width * (0.12 + ($rand.NextDouble() * 0.10)))
  $signY = [int]($Height * 0.22)
  $Graphics.FillEllipse($signBrush, $signX, $signY, $signSize, $signSize)
  $font = New-Object System.Drawing.Font "Arial", ([Math]::Max(12, $signSize * 0.34)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $Graphics.DrawString("A", $font, $whiteBrush, (New-Object System.Drawing.RectangleF $signX, $signY, $signSize, $signSize), $sf)
  $font.Dispose()
  $sf.Dispose()

  $carW = [int]($Width * 0.22)
  $carH = [int]($Height * 0.10)
  $carX = [int]($Width * 0.58)
  $carY = [int]($Height * 0.67)
  $Graphics.FillRectangle($signBrush, $carX, $carY, $carW, $carH)
  $Graphics.FillPie($signBrush, $carX + [int]($carW * 0.18), $carY - [int]($carH * 0.55), [int]($carW * 0.55), $carH, 180, 180)
  $wheelBrush = New-Brush ([System.Drawing.Color]::FromArgb(35, 35, 35))
  $Graphics.FillEllipse($wheelBrush, $carX + [int]($carW * 0.12), $carY + [int]($carH * 0.72), [int]($carH * 0.55), [int]($carH * 0.55))
  $Graphics.FillEllipse($wheelBrush, $carX + [int]($carW * 0.68), $carY + [int]($carH * 0.72), [int]($carH * 0.55), [int]($carH * 0.55))
  $wheelBrush.Dispose()
  $signBrush.Dispose()
  $whiteBrush.Dispose()

  Draw-Watermark $Graphics $Width $Height $Watermark
}

function Draw-Watermark($Graphics, $Width, $Height, $Text) {
  $size = [Math]::Max(18, [Math]::Min($Width, $Height) * 0.075)
  $font = New-Object System.Drawing.Font "Arial", $size, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(95, 255, 255, 255))
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(75, 0, 0, 0))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Far
  $format.LineAlignment = [System.Drawing.StringAlignment]::Far
  $margin = [Math]::Max(12, [Math]::Min($Width, $Height) * 0.04)
  $area = New-Object System.Drawing.RectangleF $margin, $margin, ($Width - ($margin * 2)), ($Height - ($margin * 2))
  $shadowArea = New-Object System.Drawing.RectangleF ($margin + 2), ($margin + 2), ($Width - ($margin * 2)), ($Height - ($margin * 2))
  $Graphics.DrawString($Text, $font, $shadow, $shadowArea, $format)
  $Graphics.DrawString($Text, $font, $brush, $area, $format)
  $font.Dispose()
  $brush.Dispose()
  $shadow.Dispose()
  $format.Dispose()
}

function Save-Image($Bitmap, $Path) {
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $tmp = "$Path.tmp"
  if ($extension -eq ".png") {
    $Bitmap.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  } else {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88L
    $Bitmap.Save($tmp, $codec, $params)
    $params.Dispose()
  }
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

$rootPath = Resolve-Path $Root
$files = Get-ChildItem -LiteralPath $rootPath -Recurse -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png)$' }
$count = 0

foreach ($file in $files) {
  $size = Get-ImageSize $file.FullName
  $bitmap = New-Object System.Drawing.Bitmap $size.Width, $size.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    Draw-RoadScene $graphics $size.Width $size.Height ([Math]::Abs($file.Name.GetHashCode())) $Watermark
    Save-Image $bitmap $file.FullName
    $count++
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

Write-Host "Regenerated $count image files with '$Watermark' watermark under $rootPath"
