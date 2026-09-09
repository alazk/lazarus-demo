import { fetch as httpFetch } from "newton:provider/http@0.2.0";

export function run(wasm_args) {
  const r = httpFetch({
    url: "https://lazarus-exposure-demo-git-main-k-93d6.vercel.app/api/rules",
    method: "GET",
    headers: [["Accept", "application/json"]],
    body: null,
  });
  const res = (r && r.tag) ? r.val : r;
  return JSON.stringify({
    rType: typeof r,
    rTag: r ? String(r.tag) : "none",
    status: res ? res.status : "no response",
    bodyType: typeof (res && res.body),
    isArray: Array.isArray(res && res.body),
    len: res && res.body ? res.body.length : -1,
    hasTextDecoder: typeof TextDecoder,
  });
}
