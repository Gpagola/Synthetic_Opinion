"""Genera N personas residentes en España de modo que el CONJUNTO (las de España
ya existentes + las nuevas) se aproxime a la pirámide poblacional de España
(franja de edad × sexo). Considera la base de datos actual.

La configuración demográfica y cultural de España vive en `app.countries` y la
lógica de reparto en `app.services.population` (compartida con Chile).

Uso:  python seed_spain_pyramid.py [nuevas] [semilla]   (por defecto 600 / 600)
"""

from __future__ import annotations

import sys

from app.services.population import run_seed

NUEVAS = int(sys.argv[1]) if len(sys.argv) > 1 else 600
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 600


if __name__ == "__main__":
    run_seed("ES", NUEVAS, SEED)
