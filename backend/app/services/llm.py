"""Capa de abstracción del LLM.

Wrapper fino sobre el SDK de OpenAI con una interfaz `LLMProvider`, de modo que
cambiar de modelo o de proveedor no obligue a tocar el resto de servicios.
"""

from __future__ import annotations

import json
from typing import Protocol

from openai import OpenAI

from app.config import settings


class LLMProvider(Protocol):
    def complete_text(self, system: str, user: str, temperature: float | None = None) -> str: ...

    def complete_json(self, system: str, user: str, temperature: float | None = None) -> dict: ...


class OpenAIProvider:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY no está configurada.")
        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model
        self._default_temp = settings.openai_temperature

    def complete_text(self, system: str, user: str, temperature: float | None = None) -> str:
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **self._temp_kwargs(temperature),
        )
        return (resp.choices[0].message.content or "").strip()

    def _temp_kwargs(self, temperature: float | None) -> dict:
        # Los modelos GPT-5.x de chat solo admiten temperature=1 (por defecto).
        # Para máxima compatibilidad, solo enviamos temperature si es exactamente 1.
        t = self._default_temp if temperature is None else temperature
        return {"temperature": t} if t == 1 else {}

    def complete_json(self, system: str, user: str, temperature: float | None = None) -> dict:
        """Pide al modelo una respuesta en JSON y la parsea."""
        resp = self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **self._temp_kwargs(temperature),
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)


_provider: LLMProvider | None = None


def get_llm() -> LLMProvider:
    """Devuelve el proveedor LLM activo (singleton perezoso)."""
    global _provider
    if _provider is None:
        _provider = OpenAIProvider()
    return _provider
