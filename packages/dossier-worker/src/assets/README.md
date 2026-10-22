# Assets

`steg-logo.png` is the STEG logo supplied by the product owner on 2026-10-22 (trimmed of its white
margin and resized to 300 px wide; source image: the owner's own copy, steg.com.tn was unreachable).
It is committed, never fetched at generation time, and must stay a PNG at most 300 px wide.
If it is ever missing, `tryLoadStegLogo()` returns null and renderers omit the logo.
