Place artist and staff images in these folders with the exact filenames below.

Filenames (lowercase, no spaces):
- assets/artists/tysan.jpg
- assets/artists/jaka.jpg
- assets/artists/tobba.jpg
- assets/artists/collin.jpg
- assets/artists/n30n.jpg
- assets/artists/saito.jpg

- assets/staff/brian.jpg
- assets/staff/richard.jpg
- assets/staff/agus.jpg

Design rules (mandatory):
- Grayscale forced in the UI: all photos receive a CSS filter `.art-image { filter: grayscale(100%) contrast(1.15); }` so uploaded photos should be full-color originals; the site will render them unified in grayscale.
- Logo: keep as `assets/logo.svg` (vector SVG recommended).

Recommended formats & why:
- WebP (preferred): smallest size for photographic content with good quality.
- JPEG (progressive): fallback if WebP is not available or for compatibility.
- PNG: only when you need transparency (not recommended for photos).
- SVG: only for logos or vector art, not for photos.

Resolution & sizing (mobile-first):
- Artist tiles: 3:4 ratio. Recommended pixel size: 1000x1333 (good balance of quality and weight). The HTML uses `width="1000" height="1333"` for layout.
- Staff headshots: square. Recommended: 800x800 (or 400x400 for faster loads).
- Deliver WebP versions alongside originals if possible (e.g. `tysan.webp`).
- Target file size: under 300–400 KB (prefer <200 KB for mobile) after compression.

Batch conversion (Windows PowerShell) — ImageMagick installed:
1) Single file (resize + convert to WebP):
	magick "input.jpg" -resize 1000x1333^> -strip -quality 82 "output.webp"

2) Batch convert all artist JPGs to WebP, resized to 1000x1333:
	Get-ChildItem -Path .\assets\artists -Filter *.jpg | ForEach-Object { $in=$_.FullName; $out=[System.IO.Path]::ChangeExtension($in, '.webp'); magick $in -resize 1000x1333^> -strip -quality 82 $out }

Alternative: Google `cwebp` (from libwebp) for very small files:
	cwebp -q 80 input.jpg -o output.webp

Notes on workflow:
- Drop full-resolution original photos into `assets/artists/` and `assets/staff/` with the filenames above.
- The site will load the images with `loading="lazy"` and apply the grayscale filter automatically.
- If you want, I can (a) convert uploaded images to WebP and place optimized copies in the folders, or (b) provide a small PowerShell script you run locally to batch-convert.

If you want me to produce optimized WebP versions, upload the photos here or tell me to generate a PowerShell batch script you can run locally.