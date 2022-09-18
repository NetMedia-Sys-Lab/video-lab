import { useMemo } from "react";
import { RunConfig, RunOrResult, RunsFilterType } from "../types/result.type";

export function useFilterRuns(runs: RunOrResult[], filter: RunsFilterType) {
    return useMemo(() => {
        // let f = [...runs.map(result => ({ ...result }))]
        let f = runs
        if (filter.runId) {
            f = f.map(result => ({
                ...result,
                runs: result.runs &&
                    result.runs.filter(r => r.runId.toLowerCase().indexOf(filter.runId!.toLowerCase()) >= 0)
            }))
            console.log("Filtering", f)
        }
        return f
    }, [runs, filter])
}