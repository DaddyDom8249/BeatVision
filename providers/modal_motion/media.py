"""Local, deterministic media preparation for the isolated Modal proof."""

from __future__ import annotations

from PIL import Image, ImageOps


def prepare_source_image(source: Image.Image, width: int, height: int) -> Image.Image:
    """Contain an approved source image on an exact-size RGB canvas.

    LTX receives the requested proof dimensions, so the source must have those
    dimensions without stretching the approved image. Letterboxing preserves
    the original aspect ratio and leaves the source bytes and stored asset
    untouched.
    """
    if not isinstance(source, Image.Image) or width < 1 or height < 1:
        raise ValueError('SOURCE_IMAGE_INVALID')
    contained = ImageOps.contain(
        source.convert('RGB'),
        (width, height),
        method=Image.Resampling.LANCZOS,
    )
    canvas = Image.new('RGB', (width, height), (0, 0, 0))
    canvas.paste(contained, ((width - contained.width) // 2, (height - contained.height) // 2))
    return canvas
