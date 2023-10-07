from collections import defaultdict
import threading
from time import time


def debounce(wait_time):
    """
    Decorator that will debounce a function so that it is called after wait_time seconds
    If it is called multiple times, will wait for the last call to be debounced and run only this one.
    """

    def decorator(function):
        def debounced(*args, **kwargs):
            signature = (tuple(map(id, args)), tuple(map(id, kwargs.keys())), tuple(map(id, kwargs.values())))
            debounced._call_params[signature] = (args, kwargs)

            def call_function():
                del debounced._timer[signature]
                _args, _kwargs = debounced._call_params[signature]
                return function(*_args, **_kwargs)

            # if we already have a call to the function currently waiting to be executed, reset the timer
            reduce_time = 0
            if signature in debounced._timer:
                debounced._timer[signature].cancel()
                reduce_time = time() - debounced._timer_start_time[signature]

            # after wait_time, call the function provided to the decorator with its arguments
            debounced._timer[signature] = threading.Timer(max(0, wait_time - reduce_time), call_function)
            debounced._timer[signature].start()
            debounced._timer_start_time[signature] = time()

        debounced._timer = {}
        debounced._call_params = {}
        debounced._timer_start_time = {}
        return debounced

    return decorator


def throttle(wait_time):
    """
    Decorator that will debounce a function so that it is called after wait_time seconds
    If it is called multiple times, will wait for the last call to be debounced and run only this one.
    """

    def decorator(function):
        def throttled(*args, **kwargs):
            signature = (tuple(map(id, args)), tuple(map(id, kwargs.keys())), tuple(map(id, kwargs.values())))
            throttled._call_params[signature] = (args, kwargs)

            def call_function():
                throttled._called_at[signature] = time()
                _args, _kwargs = throttled._call_params[signature]
                return function(*_args, **_kwargs)

            last_call_time = throttled._called_at[signature]
            curr_time = time()

            # Run or schedule only if not scheduled
            if signature not in throttled._timer:
                if last_call_time < curr_time - wait_time:
                    call_function()
                else:
                    throttled._timer[signature] = timer = threading.Timer(max(0, wait_time - curr_time + last_call_time), call_function)
                    timer.start()

        throttled._called_at = defaultdict(float)
        throttled._call_params = {}
        throttled._timer = {}
        return throttled

    return decorator
