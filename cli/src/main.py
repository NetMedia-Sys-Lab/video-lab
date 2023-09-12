import asyncio
import os
from typing import Callable, Dict, List, Optional, Set, TypedDict
import socketio


class JobType(TypedDict):
    job_name: str
    job_id: str
    status: str
    error: str
    stdouterr: str
    scheduled_at: Optional[int]
    run_at: Optional[int]
    finished_at: Optional[int]


class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


class SocketClient:
    def __init__(self):
        self.sio = socketio.AsyncClient()
        self._state = {}
        self._state_update_handlers: Dict[str, Set[Callable]] = {}

    async def setup(self):
        await self.sio.connect("http://localhost:3001")

        @self.sio.event
        def disconnect():
            print("SocketIO disconnected!")

        @self.sio.event
        async def state_update(data):
            key = data["key"]
            print(f"State Updated for key : {key}")
            self._state[key] = data["value"]
            handlers = self._state_update_handlers.get(key)
            if handlers is not None:
                for handler in handlers:
                    await handler(self._state[key])

        print("SocketIO Connected, SID:", self.sio.sid)

    async def sub_state(self, key: str, handler: Optional[Callable] = None):
        await self.sio.emit("state_sub", {"key": key})
        if handler is not None:
            self._state_update_handlers.setdefault(key, set()).add(handler)


def clear_term():
    if os.name == "posix":
        os.system("clear")
    else:
        os.system("cls")


async def job_manager_state_updated(job_queues: Dict[str, List[JobType]]):
    clear_term()
    job_limit = 10
    for q_name, jobs in job_queues.items():
        print(f"{q_name.upper()} ({len(jobs)})")

        color = ''
        if q_name.upper() == "SUCCESSFUL":
            color = bcolors.OKGREEN
        elif q_name.upper() == "FAILED":
            color = bcolors.FAIL
        elif q_name.upper() == "RUNNING":
            color = bcolors.WARNING

        for job in jobs[:job_limit+1]:
            print(f"{color}{job['job_name']}{bcolors.ENDC}")
        if len(jobs) > job_limit:
            print(f"... {len(jobs)-job_limit} more")
        print()


async def main():
    client = SocketClient()
    await client.setup()
    await client.sub_state("job_manager_state", job_manager_state_updated)
    await asyncio.sleep(100000000)


if __name__ == "__main__":
    asyncio.run(main())
