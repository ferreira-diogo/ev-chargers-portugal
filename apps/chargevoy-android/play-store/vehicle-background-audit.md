# Android vehicle background audit — 2026-10-08

47 catalogue entries previously had `background_removed: false`. All now have Android-only transparent WebP overrides in `../vehicle-images/`; the website catalogue and photographs remain unchanged.

The pipeline changes alpha only. `scripts/finalize-vehicle-backgrounds.py` verifies decoded RGB equals the original JPG pixel for pixel, keeps the original dimensions, and writes SHA-256 evidence for both files. Lossless WebP uses `exact=True` so even transparent RGB is retained. Original author, source URL and licence fields are retained in the Android credits catalogue.

Initial segmentation used rembg[cpu] 2.0.85 with U2NetP and quantized SAM. Reviewed silhouettes in `manual-masks.json` refine difficult neighbouring-car/reflection cases without synthesizing pixels. Mask coordinates use a 600×400 review canvas. Regeneration: run `scripts/segment-vehicle-backgrounds.py`, then `scripts/finalize-vehicle-backgrounds.py`; inspect the three generated review sheets before approving a change. Install Pillow, NumPy, SciPy and rembg[cpu]==2.0.85 for regeneration. Model files are not shipped with the app.

Some source photos are partial views or contain occluding signs/glass/reflections. Their original framing and visible details remain; missing bodywork is not reconstructed. Segmentation does not grant new image rights; attribution/licence review remains part of release readiness.

The Android build copies only catalogue entries and approved image overrides. Review sheets and model files are not bundled. Node regression tests verify each bundled override against the reviewed SHA-256 and its original attribution mapping.
