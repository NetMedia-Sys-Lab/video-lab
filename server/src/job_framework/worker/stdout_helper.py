from io import StringIO, TextIOBase
import os
import threading
import sys
import traceback
from typing import Tuple
from werkzeug import local

# Save all of the objects for use later.
orig___stdout__ = sys.__stdout__
orig___stderr__ = sys.__stderr__
orig_stdout = sys.stdout
orig_stderr = sys.stderr


thread_proxies_stdout = {}
thread_proxies_stderr = {}

class MuxedStream(threading.Thread):
    def __init__(self, name, parent_stream):
        super(MuxedStream, self).__init__(daemon=True)
        self.done = False
        self.read_fd, self.write_fd = os.pipe()
        self.writer = os.fdopen(self.write_fd, 'w')
        self.reader = os.fdopen(self.read_fd)
        self.prefix = name + " "
        self.parent_stream = parent_stream
        self.start()

    def fileno(self):
        return self.write_fd

    def run(self):
        try:
            while line := self.reader.readline():
                self.parent_stream.write(self.prefix)
                self.parent_stream.write(line)
        except:
            print(traceback.format_exc())
            pass
        finally:
            self.reader.close()

    def close(self):
        # self.done = True
        os.close(self.writer)
        pass


def redirect(parent_stream) -> Tuple[threading.Thread, threading.Thread]:
    """
    Enables the redirect for the current thread's output to a single cStringIO
    object and returns the object.

    :return: The StringIO object.
    :rtype: ``cStringIO.StringIO``
    """
    # Get the current thread's identity.
    ident = threading.currentThread().ident
    stdout_thread = MuxedStream("STDOUT", parent_stream)
    stderr_thread = MuxedStream("STDERR", parent_stream)
    # Enable the redirect and return the cStringIO object.
    thread_proxies_stdout[ident] = stdout_thread.writer
    thread_proxies_stderr[ident] = stderr_thread.writer

    return stdout_thread, stderr_thread


def stop_redirect():
    """
    Enables the redirect for the current thread's output to a single cStringIO
    object and returns the object.

    :return: The final string value.
    :rtype: ``str``
    """
    # Get the current thread's identity.
    ident = threading.currentThread().ident

    # Only act on proxied threads.
    if ident in thread_proxies_stdout:
        thread_proxies_stdout[ident].close()
        del thread_proxies_stdout[ident]

    # Only act on proxied threads.
    if ident in thread_proxies_stderr:
        thread_proxies_stderr[ident].close()
        del thread_proxies_stderr[ident]


def _get_stream(original, thread_proxies):
    """
    Returns the inner function for use in the LocalProxy object.

    :param original: The stream to be returned if thread is not proxied.
    :type original: ``file``
    :return: The inner function for use in the LocalProxy object.
    :rtype: ``function``
    """
    def proxy():
        """
        Returns the original stream if the current thread is not proxied,
        otherwise we return the proxied item.

        :return: The stream object for the current thread.
        :rtype: ``file``
        """
        # Get the current thread's identity.
        ident = threading.currentThread().ident

        # Return the proxy, otherwise return the original.
        return thread_proxies.get(ident, original)

    # Return the inner function.
    return proxy


def enable_proxy():
    """
    Overwrites __stdout__, __stderr__, stdout, and stderr with the proxied
    objects.
    """
    sys.__stdout__ = local.LocalProxy(
        _get_stream(sys.__stdout__, thread_proxies_stdout))
    sys.__stderr__ = local.LocalProxy(
        _get_stream(sys.__stderr__, thread_proxies_stderr))
    sys.stdout = local.LocalProxy(
        _get_stream(sys.stdout, thread_proxies_stdout))
    sys.stderr = local.LocalProxy(
        _get_stream(sys.stderr, thread_proxies_stderr))


def disable_proxy():
    """
    Overwrites __stdout__, __stderr__, stdout, and stderr with the original
    objects.
    """
    sys.__stdout__ = orig___stdout__
    sys.__stderr__ = orig___stderr__
    sys.stdout = orig_stdout
    sys.stderr = orig_stderr
