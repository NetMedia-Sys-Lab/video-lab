import { DependencyList, RefObject, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";


export function useDebouncedState<T>(initialValue: T, deps: DependencyList = []): [T, (val: T) => void] {
    const initialValueMemo = useMemo(() => initialValue, deps)
    const [debouncedValue, setDebouncedValue] = useState<T>(initialValueMemo)
    const valueSetter = useMemo(() => {
        let renderTimer: NodeJS.Timeout;
        return (value: T) => {
            if (renderTimer) {
                clearTimeout(renderTimer)
            }
            renderTimer = setTimeout(() => {
                setDebouncedValue(value)
            }, 300)
        }
    }, deps);


    return [debouncedValue, valueSetter]
}

export function useDimensions<T extends Element>(ref: RefObject<T>) {
    const [dimensions, setDimensions] = useDebouncedState({ height: 0, width: 0 });

    useLayoutEffect(() => {
        const update = () => {
            if (!ref.current) return
            const node = ref.current
            const height = node.getBoundingClientRect().height
            const width = node.getBoundingClientRect().width
            if (height !== dimensions.height || width !== dimensions.width) {
                setDimensions({ height, width })
            }
        }

        window.addEventListener('resize', update)
        update()

        return () => {
            window.removeEventListener('resize', update)
        }
    }, [ref])

    return dimensions;
}

export function useQueryString(varName: string, defaultValue?: string) {
    const { search } = useLocation();
    return useMemo(() => {
        if (search) {
            const p = new URLSearchParams(search).get(varName)
            return p || defaultValue
        } else {
            return defaultValue
        }
    }, [search]);
}

export function useQueryArray(varName: string, defaultValue?: string[]) {
    const { search } = useLocation();
    return useMemo(() => {
        if (search) {
            const p = new URLSearchParams(search).get(varName)
            return p ? p.split(",") : defaultValue
        } else {
            return defaultValue
        }
    }, [search]);
}

export function useSavedState<T>(varName: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(defaultValue);
    const localStorageKey = `VAR_${varName}`;

    useEffect(() => {
        const storedState = localStorage.getItem(localStorageKey);
        if (storedState) {
            try {
                setState(JSON.parse(storedState));
            } catch (e) { }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(localStorageKey, JSON.stringify(state));
        } catch (e) { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    return [state, setState];
}