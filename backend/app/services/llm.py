"""Capa de abstracción del LLM.

Wrapper fino sobre los SDK de OpenAI y Anthropic con una interfaz `LLMProvider`,
de modo que cambiar de modelo o de proveedor no obligue a tocar el resto de
servicios. Los Focus Groups (turnos + informe) usan Anthropic; el resto OpenAI.
"""

from __future__ import annotations

import json
from typing import Protocol

from openai import OpenAI

from app.config import settings


class LLMProvider(Protocol):
    def complete_text(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> str: ...

    def complete_json(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> dict: ...


class OpenAIProvider:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY no está configurada.")
        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model
        self._default_temp = settings.openai_temperature

    def _kwargs(self, temperature, model, reasoning_effort, json_mode):
        kw = {"model": model or self._model}
        if json_mode:
            kw["response_format"] = {"type": "json_object"}
        if reasoning_effort:
            # Modelos de razonamiento (GPT-5.x): se envía reasoning_effort y NO temperature.
            kw["reasoning_effort"] = reasoning_effort
        else:
            t = self._default_temp if temperature is None else temperature
            if t is not None:
                kw["temperature"] = t
        return kw

    def complete_text(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> str:
        resp = self._client.chat.completions.create(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **self._kwargs(temperature, model, reasoning_effort, False),
        )
        return (resp.choices[0].message.content or "").strip()

    def complete_json(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> dict:
        """Pide al modelo una respuesta en JSON y la parsea."""
        resp = self._client.chat.completions.create(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **self._kwargs(temperature, model, reasoning_effort, True),
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)


def _extract_json(text: str) -> dict:
    """Parsea el JSON de una respuesta de Claude de forma robusta: localiza el
    primer `{` y usa `raw_decode`, que lee SOLO el primer objeto JSON balanceado
    e ignora cualquier prefijo (vallas ```json) o cola (texto extra tras el `}`,
    vallas de cierre). Evita el error 'Extra data' aunque el modelo añada texto."""
    t = (text or "").strip()
    ini = t.find("{")
    if ini == -1:
        raise json.JSONDecodeError("No se encontró objeto JSON", t or "", 0)
    obj, _ = json.JSONDecoder().raw_decode(t[ini:])
    return obj


class AnthropicProvider:
    """Proveedor sobre el SDK oficial de Anthropic (Claude Opus 4.8).

    Implementa el mismo `LLMProvider`: `temperature` se ignora (Opus 4.8 la
    rechaza), `reasoning_effort` se mapea a `output_config.effort`, y `model`
    solo se respeta si es un id `claude-*` (los modelos `gpt-*` que pasan los
    call sites se ignoran, cayendo al modelo Claude por defecto)."""

    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY no está configurada.")
        from anthropic import Anthropic  # import perezoso

        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model
        self._effort = settings.anthropic_effort
        self._max_tokens = settings.anthropic_max_tokens

    def _create(self, system: str, user: str, model: str | None,
                reasoning_effort: str | None, json_hint: bool) -> str:
        mdl = model if (model and model.startswith("claude")) else self._model
        effort = reasoning_effort or self._effort
        sys = system + ("\n\nResponde ÚNICAMENTE con el objeto JSON pedido, sin texto "
                        "adicional ni vallas de código." if json_hint else "")
        # Streaming + get_final_message: evita timeouts en informes largos.
        with self._client.messages.stream(
            model=mdl,
            max_tokens=self._max_tokens,
            system=sys,
            messages=[{"role": "user", "content": user}],
            thinking={"type": "adaptive"},
            output_config={"effort": effort},
        ) as stream:
            msg = stream.get_final_message()
        return "".join(b.text for b in msg.content if b.type == "text").strip()

    def complete_text(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> str:
        return self._create(system, user, model, reasoning_effort, json_hint=False)

    def complete_json(self, system: str, user: str, temperature: float | None = None,
                      model: str | None = None, reasoning_effort: str | None = None) -> dict:
        return _extract_json(self._create(system, user, model, reasoning_effort, json_hint=True))


_providers: dict[str, LLMProvider] = {}
_FACTORIES = {"openai": OpenAIProvider, "anthropic": AnthropicProvider}


def get_llm(provider: str | None = None) -> LLMProvider:
    """Devuelve el proveedor LLM pedido (singleton perezoso por proveedor).

    `provider`: "openai" (por defecto) o "anthropic" (Focus Groups)."""
    key = (provider or "openai").lower()
    if key not in _FACTORIES:
        raise ValueError(f"Proveedor LLM desconocido: {provider}")
    if key not in _providers:
        _providers[key] = _FACTORIES[key]()
    return _providers[key]
