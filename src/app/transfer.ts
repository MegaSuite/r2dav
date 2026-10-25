import pLimit from "p-limit";

import { encodeKey, type TransferTask } from "./types";
import { resolveMime } from "./mime";

const WEBDAV_ENDPOINT = "/webdav/";
const THUMBNAIL_SIZE = 144;

export const SIZE_LIMIT = 100 * 1000 * 1000; // 100MB

class UploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export async function generateThumbnail(file: File): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext("2d")!;

  if (file.type.startsWith("image/")) {
    const image = await new Promise<HTMLImageElement>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = URL.createObjectURL(file);
    });
    ctx.drawImage(image, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "video/mp4") {
    const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(file);
      setTimeout(() => reject(new Error("Video load timeout")), 2000);
      video.play().then(() => {
        video.pause();
        video.currentTime = 0;
        resolve(video);
      }, reject);
    });
    ctx.drawImage(video, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "application/pdf") {
    const pdfjsLib = await import(
      // @ts-ignore
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const page = await pdf.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_SIZE / Math.max(width, height);
    const viewport = page.getViewport({ scale });
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

export async function blobDigest(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function xhrFetch(
  url: string,
  requestInit: RequestInit & {
    onUploadProgress?: (loaded: number, total: number) => void;
  }
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      requestInit.onUploadProgress?.(event.loaded, event.total);
    };
    xhr.open(requestInit.method ?? "GET", url);
    const headers = new Headers(requestInit.headers);
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      const responseHeaders = xhr
        .getAllResponseHeaders()
        .trim()
        .split("\r\n")
        .filter(Boolean)
        .reduce((acc, header) => {
          const separator = header.indexOf(": ");
          if (separator > 0) {
            acc[header.slice(0, separator)] = header.slice(separator + 2);
          }
          return acc;
        }, {} as Record<string, string>);

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            headers: responseHeaders,
          })
        );
      } else {
        reject(
          new UploadError(
            xhr.responseText || `Upload failed (${xhr.status})`,
            xhr.status
          )
        );
      }
    };
    xhr.onerror = () => reject(new UploadError("Network error", 0));
    xhr.onabort = () => reject(new UploadError("Upload aborted", 0));

    if (
      requestInit.body instanceof Blob ||
      typeof requestInit.body === "string"
    ) {
      xhr.send(requestInit.body);
    } else {
      xhr.send();
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadPartWithRetry(
  url: string,
  chunk: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await xhrFetch(url, {
        method: "PUT",
        headers,
        body: chunk,
        onUploadProgress: onProgress,
      });
    } catch (error) {
      lastError = error;
      const status = error instanceof UploadError ? error.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt === 2) throw error;
      await delay(500 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function multipartUpload(
  key: string,
  file: File,
  options?: {
    headers?: Record<string, string>;
    onUploadProgress?: (loaded: number, total: number) => void;
  }
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
    "content-type": resolveMime(key, file.type),
  };

  const createResponse = await fetch(`/webdav/${encodeKey(key)}?uploads`, {
    headers,
    method: "POST",
  });
  if (!createResponse.ok) {
    throw new UploadError(
      (await createResponse.text()) || "Could not start upload",
      createResponse.status
    );
  }
  const { uploadId } = (await createResponse.json()) as { uploadId: string };

  const totalChunks = Math.ceil(file.size / SIZE_LIMIT);
  const limit = pLimit(2);
  const parts = Array.from({ length: totalChunks }, (_, index) => index + 1);
  const partsLoaded = Array.from({ length: totalChunks + 1 }, () => 0);

  const uploadedParts = await Promise.all(
    parts.map((partNumber) =>
      limit(async () => {
        const chunk = file.slice(
          (partNumber - 1) * SIZE_LIMIT,
          partNumber * SIZE_LIMIT
        );
        const searchParams = new URLSearchParams({
          partNumber: partNumber.toString(),
          uploadId,
        });
        const uploadUrl = `/webdav/${encodeKey(key)}?${searchParams}`;
        const response = await uploadPartWithRetry(
          uploadUrl,
          chunk,
          headers,
          (loaded) => {
            partsLoaded[partNumber] = loaded;
            options?.onUploadProgress?.(
              partsLoaded.reduce((total, value) => total + value, 0),
              file.size
            );
          }
        );
        const etag = response.headers.get("etag");
        if (!etag) throw new UploadError("Missing part ETag", response.status);
        return { partNumber, etag };
      })
    )
  );

  const completeParams = new URLSearchParams({ uploadId });
  const completeResponse = await fetch(
    `/webdav/${encodeKey(key)}?${completeParams}`,
    {
      method: "POST",
      body: JSON.stringify({ parts: uploadedParts }),
    }
  );
  if (!completeResponse.ok) {
    throw new UploadError(
      (await completeResponse.text()) || "Could not complete upload",
      completeResponse.status
    );
  }
  return completeResponse;
}

export async function processTransferTask({
  task,
  onTaskProgress,
}: {
  task: TransferTask;
  onTaskProgress?: (loaded: number, total: number) => void;
}): Promise<Response | void> {
  const { remoteKey, file } = task;
  if (task.type !== "upload" || !file) throw new Error("Invalid task");

  let thumbnailDigest: string | null = null;
  if (
    file.type.startsWith("image/") ||
    file.type === "video/mp4" ||
    file.type === "application/pdf"
  ) {
    try {
      const thumbnailBlob = await generateThumbnail(file);
      const digestHex = await blobDigest(thumbnailBlob);
      const thumbnailUploadUrl = `/webdav/_$flaredrive$/thumbnails/${digestHex}.png`;
      try {
        const response = await fetch(thumbnailUploadUrl, {
          method: "PUT",
          body: thumbnailBlob,
        });
        if (!response.ok) throw new Error("Thumbnail upload failed");
        thumbnailDigest = digestHex;
      } catch {
        console.log(`Upload ${digestHex}.png failed`);
      }
    } catch {
      console.log("Generate thumbnail failed");
    }
  }

  const headers: Record<string, string> = {
    "content-type": resolveMime(remoteKey, file.type),
  };
  if (thumbnailDigest) headers["fd-thumbnail"] = thumbnailDigest;

  if (file.size >= SIZE_LIMIT) {
    return multipartUpload(remoteKey, file, {
      headers,
      onUploadProgress: onTaskProgress,
    });
  }

  return xhrFetch(`${WEBDAV_ENDPOINT}${encodeKey(remoteKey)}`, {
    method: "PUT",
    headers,
    body: file,
    onUploadProgress: onTaskProgress,
  });
}
