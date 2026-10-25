// Smoke-test signed direct links against a running Pages dev server or a
// deployed instance.
//
//   BASE_URL=http://127.0.0.1:8788 \
//   WEBDAV_USERNAME=test WEBDAV_PASSWORD=test-pass \
//   node scripts/verify-share.mjs

const base = process.env.BASE_URL?.replace(/\/$/, "");
const username = process.env.WEBDAV_USERNAME;
const password = process.env.WEBDAV_PASSWORD;

if (!base || !username || !password) {
  console.error(
    "Set BASE_URL, WEBDAV_USERNAME and WEBDAV_PASSWORD environment variables."
  );
  process.exit(2);
}

const authorization =
  "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
const yamlKey = "r2dav-share-test.yaml";
const icsKey = "r2dav-share-test.ics";
const dirKey = "r2dav-share-test-dir";
const internalKey = "_$flaredrive$/thumbnails/r2dav-share-test.png";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function authed(path, init = {}) {
  return fetch(base + path, {
    ...init,
    headers: { Authorization: authorization, ...(init.headers || {}) },
  });
}

async function share(path, expiresIn = 0) {
  const response = await authed("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, expiresIn }),
  });
  return { response, body: await response.json().catch(() => null) };
}

async function main() {
  const yamlBody = "proxies:\n  - name: r2dav-test\n    type: ss\n";
  const icsBody =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//r2dav//test//EN\r\nEND:VCALENDAR\r\n";

  for (const [key, body, type] of [
    [yamlKey, yamlBody, "application/octet-stream"],
    [icsKey, icsBody, "application/octet-stream"],
  ]) {
    const put = await authed(`/webdav/${key}`, {
      method: "PUT",
      headers: { "Content-Type": type },
      body,
    });
    check(`upload ${key}`, put.status === 201, String(put.status));
  }

  const created = await share(yamlKey, 0);
  check("create permanent share", created.response.status === 200);
  check("share returns URL", typeof created.body?.url === "string");

  const url = created.body.url;
  const direct = await fetch(url);
  const directBody = await direct.text();
  check("anonymous GET", direct.status === 200, String(direct.status));
  check(
    "yaml content type",
    (direct.headers.get("content-type") || "").includes("text/yaml")
  );
  check("yaml body", directBody === yamlBody);

  const range = await fetch(url, { headers: { Range: "bytes=0-6" } });
  check("range status", range.status === 206, String(range.status));
  check(
    "range header",
    (range.headers.get("content-range") || "").includes("bytes 0-6/")
  );

  const etag = direct.headers.get("etag");
  const conditional = await fetch(url, {
    headers: { "If-None-Match": etag || "" },
  });
  check("etag 304", conditional.status === 304, String(conditional.status));

  const tampered = new URL(url);
  const tamperedSign = tampered.searchParams.get("sign") || "";
  tampered.searchParams.set("sign", "A" + tamperedSign.slice(1));
  check("tampered sign 401", (await fetch(tampered)).status === 401);

  check(
    "missing sign 401",
    (await fetch(`${base}/d/${yamlKey}`)).status === 401
  );

  const icsCreated = await share(icsKey, 0);
  const ics = await fetch(icsCreated.body.url);
  check(
    "ics content type",
    (ics.headers.get("content-type") || "").includes("text/calendar")
  );
  check("ics body", (await ics.text()).includes("BEGIN:VCALENDAR"));

  const expiring = await share(yamlKey, 1);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  check("expired link 410", (await fetch(expiring.body.url)).status === 410);

  await authed(`/webdav/${dirKey}`, { method: "MKCOL" });
  check("directory share rejected", (await share(dirKey, 0)).response.status === 400);

  await authed(`/webdav/${internalKey}`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: "x",
  });
  check(
    "internal key rejected",
    (await share(internalKey, 0)).response.status === 400
  );

  for (const key of [yamlKey, icsKey, dirKey, internalKey]) {
    await authed(`/webdav/${key}`, { method: "DELETE" });
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll share-link checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
