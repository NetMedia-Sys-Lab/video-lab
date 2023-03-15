# EVENT TC_STAT 1658291634599 class prio 1:1 parent 1: Sent 0 bytes 0 pkt (dropped 0, overlimits 0 requeues 0) backlog 0b 0p requeues 0 class prio 1:2 parent 1: Sent 84 bytes 2 pkt (dropped 0, overlimits 0 requeues 0) backlog 0b 0p requeues 0 class prio 1:3 parent 1: leaf 2: Sent 1621946 bytes 1427 pkt (dropped 193, overlimits 0 requeues 0) backlog 0b 0p requeues 0 class netem 2:1 parent 2: leaf 3: class tbf 3:1 parent 3: qdisc prio 1:[00010000] root refcnt 33 bands 3 priomap 1 2 2 2 1 2 0 0 1 1 1 1 1 1 1 1 Sent 1622030 bytes 1429 pkt (dropped 193, overlimits 0 requeues 0) backlog 0b 0p requeues 0 qdisc netem 2:[00020000] parent 1:3 limit 1000 delay 75.0ms Sent 1621946 bytes 1427 pkt (dropped 193, overlimits 0 requeues 0) backlog 0b 0p requeues 0 qdisc tbf 3:[00030000] parent 2:1 rate 250Kbit burst 3000b/1 mpu 0b [0016e360] lat 864.0ms limit 30000b linklayer ethernet Sent 1621946 bytes 1427 pkt (dropped 193, overlimits 10081 requeues 0) backlog 0b 0p requeues 0

import re
from itertools import chain

from istream_player.modules.analyzer.exp_events import ExpEvent_TcStat


class TcStat:
    def __init__(self, ev: ExpEvent_TcStat) -> None:
        self.time = ev.time_rel / 1000
        self.args = ev.line.split()
        self.qdiscs = {}

        indexes = list(chain(self.all_indexes(self.args, 'class'), self.all_indexes(self.args, 'qdisc')))
        indexes.append(len(self.args))
        for i_i in range(len(indexes) - 1):
            p = self.args[indexes[i_i]:indexes[i_i + 1]]
            self.qdiscs[p[2]] = {
                'type': p[0],
                'variant': p[1],
                'dropped': sum(self.get_next_floats(p, '(dropped')),
                'backlog': sum(self.get_next_floats(p, 'backlog')),
            }
        pass

    def all_indexes(self, params, search):
        for i, a in enumerate(params):
            if a == search:
                yield i

    def get_next_floats(self, params, search):

        for i in self.all_indexes(params, search):
            matches = re.search(r'(\d+(\.\d+)?)([KMG]?)', params[i + 1])
            if matches:
                val = float(matches.group(1))
                mul = matches.group(3)
                if mul == "K":
                    val *= 1000
                elif mul == "M":
                    val *= 1000000
                elif mul == "G":
                    val *= 1000000000
                yield val

    def json(self):
        return {
            "time": self.time,
            "qdiscs": self.qdiscs
        }
