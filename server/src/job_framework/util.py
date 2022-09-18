from typing import Dict

JOB_CLASSES = {}
JOB_CACHE = {}

def job_class(cls):
    JOB_CLASSES[cls.type] = cls
    return cls


def to_job(job_dict: Dict, cache={}, loop=None):
    if job_dict['job_id'] in cache:
        job = cache[job_dict['job_id']]
        job.deserialize(job_dict, loop)
        return job
    else:
        print('Cache Miss job')
        t = job_dict['type']
        if t in JOB_CLASSES:
            job = JOB_CLASSES[t](**job_dict)
            return job
        else:
            raise Exception(f"Unknown job type : {t}")