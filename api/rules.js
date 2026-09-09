// api/rules.js — what the check actually does, read from the same files the
// screening uses.
//
// The page could hard-code this copy, but then it would drift the first time a
// floor changed and the page would describe a check nobody is running. Serving
// it from config.json and the dataset headers means the stated rules and the
// applied rules cannot disagree.

import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
  } catch {
    return null;
  }
}

/** halo.json carries the whole graph; read only its header. */
function haloHeader() {
  const halo = readJson("halo.json");
  if (!halo) return null;
  return {
    built_at: halo.built_at,
    source: halo.source,
    counts: halo.counts,
    coverage: halo.coverage,
    terminal_count: halo.terminal_count,
  };
}

export default function handler(req, res) {
  const cfg = readJson("config.json") || {};
  const seeds = readJson("seeds.json");
  const services = readJson("services.json");
  const halo = haloHeader();

  const tokens = Object.entries(cfg.token_floors || {})
    .map(([symbol, floor]) => `${floor} ${symbol}`)
    .join(", ");

  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    ready: Boolean(halo),
    dataset: {
      seeds: seeds?.count ?? null,
      seeds_pulled_at: seeds?.pulled_at ?? null,
      services: services?.count ?? null,
      graph_source: "Etherscan, queried at the time of the check",
      halo_built_at: halo?.built_at ?? null,
      halo_counts: halo?.counts ?? null,
      coverage: halo?.coverage ?? null,
    },
    rules: [
      {
        title: "Traversal stops at services",
        detail:
          "Exchanges, bridges, mixers and contracts can end a path but never sit " +
          "in the middle of one. Without this, every address that has ever used " +
          "a major exchange would be three hops from Lazarus.",
      },
      {
        title: "High-degree addresses are treated the same way",
        detail:
          `Any address with more than ${cfg.high_degree_tx_count ?? "n"} ` +
          "transactions is treated as a service whether or not it is labelled, " +
          "which catches the hubs no attribution source has named.",
      },
      {
        title: "Small transfers are ignored",
        detail:
          `Edges below ${cfg.min_eth ?? "n"} ETH${tokens ? `, or ${tokens},` : ""} ` +
          "do not count. Without a floor, anyone could taint any wallet by " +
          "sending it dust, which is an attack that happens rather than a theory.",
      },
      {
        title: "Only major tokens count",
        detail:
          "Transfers of tokens outside the list above are ignored entirely, " +
          "because spam tokens are the main way dust reaches a wallet.",
      },
      {
        title: "Distance is measured to three hops",
        detail:
          "Beyond three hops the check says nothing at all. A wallet reported " +
          "as having no exposure has no path found under these rules, which is " +
          "not the same as a clean wallet.",
      },
    ],
  });
}
