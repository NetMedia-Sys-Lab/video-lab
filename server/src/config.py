from dataclasses import dataclass


@dataclass
class HeadlessPlayer:
    resultsDir: str
    resultDirPrefix: str
    dockerCompose: str
    profilesDir: str
    envsDir: str


@dataclass
class JobManager:
    jobsDir: str
    jobManagerServerUrl: str


@dataclass
class Dataset:
    datasetDir: str


@dataclass
class StateManager:
    statesDir: str


@dataclass
class Config:
    headlessPlayer: HeadlessPlayer
    jobManager: JobManager
    dataset: Dataset
    stateManager: StateManager
    vmafDir: str
    cacheDir: str
    SSLKEYLOGFILE: str
    fontFile: str

