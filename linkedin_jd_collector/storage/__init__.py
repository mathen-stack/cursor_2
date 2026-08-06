"""Storage package: JD file writing and completed-job history tracking."""

from .file_manager import (
    FileManager,
    SavedJobFile,
    build_jd_filename,
    default_output_dir,
    job_signature,
)
from .history import HistoryStore, JobRecord

__all__ = [
    "FileManager",
    "HistoryStore",
    "JobRecord",
    "SavedJobFile",
    "build_jd_filename",
    "default_output_dir",
    "job_signature",
]
