import json
import sys
import argparse
from typing import Dict, List, Any, Literal

Json = str | int | float | List | Dict[str, Any]

JsonType = Literal["str", "int", "float", "List", "Dict"]
PRIMITIVES = ("str", "int", "float")


def get_type(j: Json) -> JsonType:
    if isinstance(j, str):
        return "str"
    elif isinstance(j, int):
        return "int"
    elif isinstance(j, float):
        return "float"
    elif isinstance(j, list):
        return "List"
    elif isinstance(j, dict):
        return "Dict"
    raise Exception("Input is not json type")


def key_to_classname(k: str) -> str:
    return k[0].upper() + k[1:]


def make_from_dict(json: Dict[str, Json], type_name: str, force_define: bool) -> (List[str], str):
    deps: List[str] = []
    code = f"class {type_name}:\n"
    for k, v in json.items():
        val_deps, val_usage = make_from_json(v, key_to_classname(k), False)
        for dep in val_deps:
            if dep not in deps:
                deps.append(dep)
        code += f"    {k}: {val_usage}\n"
    return [*deps, code], type_name


def make_from_json(json: Json, type_name: str, force_define: bool) -> (List[str], str):
    json_type = get_type(json)
    if json_type in PRIMITIVES:
        if force_define:
            return [f"{type_name} = {json_type}"], type_name
        else:
            return [], json_type
    elif json_type == "Dict":
        return make_from_dict(json, type_name, force_define)
    elif json_type == "List":
        item_deps, item_usage = make_from_json(json[0], f"{type_name}Item", False)
        if force_define:
            return [*item_deps, f"{type_name} = List[{item_usage}]"], type_name
        else:
            return item_deps, f"List[{item_usage}]"

    raise Exception("Invalid Json input")


def main():
    parser = argparse.ArgumentParser(
                    prog='Json2Class',
                    description='Convert JSON to python 3 class')
    parser.add_argument('filename')
    parser.add_argument('-n', '--name', default="Root")
    parser.add_argument('-c', '--constructor', action='store_true')
    
    args = parser.parse_args()

    with open(args.filename, 'r') as f:
        data = json.load(f)
        deps, usage = make_from_json(data, args.name, True)
        print("\n".join(deps))

        
if __name__ == "__main__":
    main()