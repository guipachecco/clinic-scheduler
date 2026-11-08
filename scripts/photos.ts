// Manages the photos of a clinic's page from the terminal, until the panel has
// its own screen for them. Run `pnpm photos` for help.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { endPools } from "../src/db/client";
import {
  addClinicPhoto,
  listClinicPhotos,
  removeClinicPhoto,
  reorderClinicPhotos,
} from "../src/modules/clinic-page/photos";
import { getClinicBySlug } from "../src/modules/clinics/clinics";

const USAGE = `Uso:
  pnpm photos list <endereço>              lista as fotos da página, na ordem (a primeira é a capa)
  pnpm photos add <endereço> <arquivo...>  adiciona fotos no fim da lista
  pnpm photos remove <endereço> <id>       remove uma foto
  pnpm photos order <endereço> <id...>     põe todas as fotos nesta ordem`;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const SYSTEM = { system: true } as const;

class CommandError extends Error {}

async function clinicIdOf(slug: string | undefined) {
  if (!slug) throw new CommandError(USAGE);
  const clinic = await getClinicBySlug(slug);
  if (!clinic)
    throw new CommandError(`Nenhuma clínica com o endereço "${slug}".`);
  return clinic.id;
}

async function list(clinicId: string) {
  const photos = await listClinicPhotos(clinicId);
  if (photos.length === 0) {
    console.log("Nenhuma foto.");
    return;
  }
  photos.forEach((photo, index) => {
    const label = index === 0 ? " (capa)" : "";
    console.log(
      `${index + 1}. ${photo.id}  ${photo.width}x${photo.height}  ${Math.round(photo.byteSize / 1024)} KB${label}`,
    );
  });
}

async function main() {
  const [command, slug, ...rest] = process.argv.slice(2);
  switch (command) {
    case "list": {
      await list(await clinicIdOf(slug));
      return;
    }
    case "add": {
      const clinicId = await clinicIdOf(slug);
      if (rest.length === 0) throw new CommandError(USAGE);
      for (const file of rest) {
        const mimeType = MIME_BY_EXTENSION[extname(file).toLowerCase()];
        if (!mimeType) {
          throw new CommandError(`${basename(file)}: use JPEG, PNG ou WebP.`);
        }
        const result = await addClinicPhoto(
          clinicId,
          { bytes: await readFile(file), mimeType },
          SYSTEM,
        );
        if (!result.ok) {
          throw new CommandError(`${basename(file)}: ${result.formError}`);
        }
        console.log(`${basename(file)} adicionada (${result.photoId}).`);
      }
      await list(clinicId);
      return;
    }
    case "remove": {
      const clinicId = await clinicIdOf(slug);
      const [photoId] = rest;
      if (!photoId) throw new CommandError(USAGE);
      if (!(await removeClinicPhoto(clinicId, photoId, SYSTEM))) {
        throw new CommandError("Essa foto não é desta clínica.");
      }
      console.log("Foto removida.");
      await list(clinicId);
      return;
    }
    case "order": {
      const clinicId = await clinicIdOf(slug);
      if (!(await reorderClinicPhotos(clinicId, rest, SYSTEM))) {
        throw new CommandError(
          "Informe todos os ids das fotos da clínica, cada um uma vez.",
        );
      }
      await list(clinicId);
      return;
    }
    default:
      throw new CommandError(USAGE);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof CommandError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => endPools());
