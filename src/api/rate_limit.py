"""Limitación de intentos por clave — ventana deslizante en memoria.

Sin dependencias externas: el estado vive en el proceso, lo mismo que el
registro de jobs de `/train`. Es suficiente para el despliegue del TFG (un
único worker de uvicorn), pero no sobrevive a reinicios ni se comparte entre
procesos; con varios workers cada uno llevaría su propia cuenta.
"""

import threading
import time

from fastapi import Request

# A partir de este número de claves distintas se purgan las expiradas, para que
# el diccionario no crezca sin límite ante un atacante que rote la IP.
_UMBRAL_PURGA = 1_000


class RateLimiter:
    """Permite como máximo `maximo` eventos por clave en `ventana_segundos`."""

    def __init__(self, maximo: int, ventana_segundos: int) -> None:
        self._maximo = maximo
        self._ventana = ventana_segundos
        self._eventos: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def segundos_de_espera(self, clave: str) -> int:
        """Devuelve 0 si la clave puede continuar, o los segundos que le faltan.

        No registra nada: solo consulta.
        """
        ahora = time.monotonic()
        with self._lock:
            vigentes = self._vigentes(clave, ahora)
            if len(vigentes) < self._maximo:
                return 0
            # El más antiguo de la ventana es el que primero deja hueco.
            return max(1, int(self._ventana - (ahora - vigentes[0])) + 1)

    def registrar(self, clave: str) -> None:
        """Anota un evento para la clave."""
        ahora = time.monotonic()
        with self._lock:
            vigentes = self._vigentes(clave, ahora)
            vigentes.append(ahora)
            self._eventos[clave] = vigentes
            if len(self._eventos) > _UMBRAL_PURGA:
                self._purgar(ahora)

    def limpiar(self, clave: str) -> None:
        """Olvida los eventos de una clave (p. ej. tras un login correcto)."""
        with self._lock:
            self._eventos.pop(clave, None)

    def reset(self) -> None:
        """Vacía todo el estado. Pensado para los tests."""
        with self._lock:
            self._eventos.clear()

    def _vigentes(self, clave: str, ahora: float) -> list[float]:
        """Eventos de la clave que siguen dentro de la ventana. Requiere el lock."""
        minimo = ahora - self._ventana
        return [t for t in self._eventos.get(clave, []) if t > minimo]

    def _purgar(self, ahora: float) -> None:
        """Elimina las claves cuyos eventos han expirado. Requiere el lock."""
        minimo = ahora - self._ventana
        self._eventos = {
            clave: marcas
            for clave, marcas in self._eventos.items()
            if any(t > minimo for t in marcas)
        }


def client_ip(request: Request) -> str:
    """IP real del cliente, tomada de `X-Forwarded-For`.

    La API vive detrás de Caddy, así que `request.client.host` es siempre la
    dirección del proxy: usarla como clave metería a todos los clientes en el
    mismo cubo y el límite pasaría a ser global — el primer atacante en agotarlo
    dejaría fuera al resto de usuarios.

    Se usa la **última** entrada de la cabecera, no la primera. Caddy *añade* la
    IP de origen a lo que ya viniera en `X-Forwarded-For` en lugar de
    reemplazarlo, de modo que un cliente que mande su propia cabecera aparece por
    delante: leer la primera entrada dejaría el límite a merced del atacante, que
    esquivaría el bloqueo cambiando ese valor en cada intento. La última es la
    que escribe el proxy y es la única que no se puede falsificar.

    Esto da por supuesto **exactamente un proxy** delante. Con una CDN encadenada
    habría que descartar tantas entradas por la derecha como proxies de confianza
    haya. Y la cabecera solo merece crédito porque el puerto 8000 escucha en
    `127.0.0.1`: si se expusiera directamente, dejaría de ser fiable.
    """
    reenviada = request.headers.get("x-forwarded-for")
    if reenviada:
        entradas = [parte.strip() for parte in reenviada.split(",") if parte.strip()]
        if entradas:
            return entradas[-1]
    return request.client.host if request.client else "desconocida"
