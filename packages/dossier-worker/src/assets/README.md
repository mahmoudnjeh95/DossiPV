# Assets

`steg-logo.png` must be the official STEG logo: a PNG at most 300 px wide, obtained from
https://www.steg.com.tn, never generated or redrawn. It is committed, never fetched at
generation time. Until it is supplied, `tryLoadStegLogo()` returns null and renderers omit the logo.
