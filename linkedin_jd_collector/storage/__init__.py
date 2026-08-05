"""Storage package: JD file writing and completed-job history tracking."""

from .file_manager import FileManager, SavedJobFile
from .history import HistoryStore, JobRecord

__all__ = ["FileManager", "HistoryStore", "JobRecord", "SavedJobFile"]
