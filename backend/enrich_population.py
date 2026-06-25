"""Enriquece la población de un país con matices A–H (sin regenerar ni borrar).

Uso:  python enrich_population.py <ES|CL> [limite]

Idempotente: salta las personas que ya tengan `sociodemografico["enriquecido"]`.
"""

from __future__ import annotations

import sys

from app.services.enrichment import enrich_country


def main() -> None:
    code = (sys.argv[1].strip().upper() if len(sys.argv) > 1 else "")
    if code not in ("ES", "CL"):
        sys.exit("Uso: python enrich_population.py <ES|CL> [limite]")
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
    enrich_country(code, limit=limit)


if __name__ == "__main__":
    main()
