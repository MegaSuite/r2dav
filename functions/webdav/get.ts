import { notFound } from "./utils";
import { RequestHandlerParams } from "./utils";
import { serveObject } from "../lib/serve";

export async function handleRequestGet({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const isThumbnail = path.startsWith("_$flaredrive$/thumbnails/");
  const response = await serveObject({
    request,
    bucket,
    key: path,
    method: "GET",
    cacheControl: isThumbnail ? "max-age=31536000" : "max-age=0, must-revalidate",
  });

  return response ?? notFound();
}
