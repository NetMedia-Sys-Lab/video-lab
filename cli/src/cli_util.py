import shutil
from typing import List, Optional

class COL_WIDTH:
    CONTENT = 1
    EXPAND = 2
    SHRINK = 3

def print_responsive_table(rows: List[List], *, max_table_width: Optional[int], col_widths: List = []):
    term_colums, _ = shutil.get_terminal_size((80, 20))

    if max_table_width is None:
        max_table_width = term_colums

    num_cols = max(len(row) for row in rows)

    col_widths += [COL_WIDTH.CONTENT] * (num_cols-len(col_widths))
    final_col_widths = [
        max(len(row[col]) for row in rows)
        for col in range(num_cols)
    ]

    for col in range(num_cols):
        if col_widths[col] is None:
            col_widths[col] = max(len(row[col]) for row in rows)
        elif col_widths[col] is 

    table_width = sum(col_widths) + 2*num_cols + num_cols + 1
    if table_width > max_table_width:
        table_width = max_table_width


    print("─" * max_table_width)
