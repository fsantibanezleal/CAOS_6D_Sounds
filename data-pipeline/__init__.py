"""Offline pipeline that converts raw audio into the manifest + embedding JSON.

This package is *not* installed on the production server. It is invoked
from the developer workstation; the resulting artifacts under ``data/`` are
committed to the repository.
"""
