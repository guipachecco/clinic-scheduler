import "server-only";

import sharp, { type OutputInfo } from "sharp";

// Turns an uploaded photo into a WebP the database stores: metadata (EXIF,
// GPS, camera) dropped, orientation applied, longest side capped.

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
// The media table checks byte_size <= 2 MB.
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const DECODED_FORMATS = ["jpeg", "png", "webp"];
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

export type ReencodedImage = {
  data: Buffer;
  width: number;
  height: number;
};

export async function reencodeImage(
  input: { bytes: Buffer; mimeType: string },
  options: { maxSide: number; quality: number },
): Promise<
  { ok: true; image: ReencodedImage } | { ok: false; formError: string }
> {
  if (!ALLOWED_IMAGE_MIME.includes(input.mimeType)) {
    return { ok: false, formError: "Envie uma imagem JPEG, PNG ou WebP." };
  }
  if (input.bytes.length === 0 || input.bytes.length > MAX_INPUT_BYTES) {
    return { ok: false, formError: "A foto deve ter no máximo 10 MB." };
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    const source = sharp(input.bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await source.metadata();
    if (!format || !DECODED_FORMATS.includes(format)) {
      return { ok: false, formError: "Envie uma imagem JPEG, PNG ou WebP." };
    }
    output = await source
      .rotate()
      .resize(options.maxSide, options.maxSide, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: options.quality })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, formError: "Não foi possível ler essa imagem." };
  }

  if (output.data.length > MAX_STORED_BYTES) {
    return {
      ok: false,
      formError: "Não foi possível reduzir essa foto. Tente uma menor.",
    };
  }
  return {
    ok: true,
    image: {
      data: output.data,
      width: output.info.width,
      height: output.info.height,
    },
  };
}
