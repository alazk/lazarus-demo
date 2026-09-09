export function run(wasm_args) {
  return JSON.stringify({ screened: false, echo: String(wasm_args) });
}
