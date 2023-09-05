import moment from "moment";
import { useEffect, useState } from "react";

export const TimeAgoComponent = (props: {
    time?: number
}) => {
    const { time } = props;
    const [timeTo, setTimeTo] = useState(moment());

    useEffect(() => {
        const updateTimeTo = () => {
            const now = Date.now();
            setTimeTo(moment(now));
            const diff = (now - time!);
            let updateAfter = 1000;
            if (diff > 60000) 
                updateAfter = 10000;
            if (diff > 600000) 
                updateAfter = 100000;
            timeout = setTimeout(updateTimeTo, updateAfter);
        }
        let timeout = setTimeout(updateTimeTo, 1000);

        return () => clearTimeout(timeout);
    });

    if (!time) return <>Never</>;

    const getDiff = () => {
        let diff = timeTo.diff(moment(time), 'seconds');
        if (diff < 60) return diff + " seconds";

        diff = timeTo.diff(moment(time), 'minutes');
        if (diff < 60) return diff + " minutes";

        diff = timeTo.diff(moment(time), 'hours');
        if (diff < 60) return diff + " hours";

        diff = timeTo.diff(moment(time), 'days');
        return diff + " days";
    }
    return <>
        {getDiff()} ago
    </>
}