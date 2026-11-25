// Web Push sender with no extra packages (VAPID RFC 8292 + aes128gcm payload encryption RFC 8291 / RFC 8188).
// Works with Chrome/Samsung/Edge (FCM, WNS), Firefox (Mozilla) and iPhone home-screen apps (Apple, iOS 16.4+).
import { createECDH, createHmac, createCipheriv, createPrivateKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";

export const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

// New VAPID key pair. publicKey = uncompressed P-256 point (65 bytes) as base64url, the form browsers want.
export function makeVapid() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)]);
  return { publicKey: b64u(raw), jwk, created: Date.now() };
}

// Authorization header value for one push service (JWT signed with ES256, valid 12 hours).
export function vapidAuth(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = createPrivateKey({ key: vapid.jwk, format: "jwk" });
  const sig = sign("sha256", Buffer.from(head + "." + body), { key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

// Encrypt the message for one phone (p256dh + auth come from the phone's subscription).
export function encrypt(plaintext, p256dh, auth, _test) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("bad subscription keys");
  const ecdh = createECDH("prime256v1");
  if (_test && _test.asPrivate) ecdh.setPrivateKey(_test.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();                       // 65 bytes, uncompressed
  const shared = ecdh.computeSecret(uaPublic);
  const salt = (_test && _test.salt) || randomBytes(16);
  // RFC 8291: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  // RFC 8188: content encryption key and nonce
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]);   // 0x02 = last (only) record
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

// Send one message. Returns the HTTP status (201/200 = delivered to the push service, 404/410 = phone gone).
export async function sendPush(sub, message, vapid, subject, ttl = 86400) {
  const body = encrypt(JSON.stringify(message), sub.keys.p256dh, sub.keys.auth);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(sub.endpoint, {
      method: "POST", signal: ctl.signal,
      headers: {
        Authorization: vapidAuth(sub.endpoint, vapid, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttl),
        Urgency: "high",
      },
      body,
    });
    let text = "";
    if (r.status >= 400) { try { text = (await r.text()).slice(0, 200); } catch {} }
    return { status: r.status, text };
  } catch (e) {
    return { status: 0, text: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}
