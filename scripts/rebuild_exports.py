#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys

from mtg_data import generate_exports, load_dataset, read_deck_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenera archivos derivados desde data/games.json.")
    parser.add_argument("--check", action="store_true", help="No escribe archivos; falla si hay diferencias.")
    parser.add_argument("--quiet", action="store_true", help="Reduce la salida.")
    args = parser.parse_args()

    dataset = load_dataset()
    generated = generate_exports(dataset, current_catalog=read_deck_catalog())
    changed = []

    for path, expected_text in generated.items():
        actual_text = path.read_text(encoding="utf-8") if path.exists() else None
        if actual_text != expected_text:
            changed.append(path)
            if not args.check:
                path.write_text(expected_text, encoding="utf-8")

    if args.check and changed:
        if not args.quiet:
            print("Archivos derivados desactualizados:")
            for path in changed:
                print(f"- {path}")
            print("Ejecuta: python scripts/rebuild_exports.py")
        return 1

    if not args.quiet:
        if changed:
            action = "Actualizaría" if args.check else "Actualizados"
            print(f"{action} {len(changed)} archivos derivados:")
            for path in changed:
                print(f"- {path}")
        else:
            print("Archivos derivados al día.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
