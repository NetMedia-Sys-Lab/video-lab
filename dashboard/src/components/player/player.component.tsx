import "./style.scss";
import {useEffect, useRef, useState} from "react";
import {FastBackwardFilled, PlayCircleOutlined} from '@ant-design/icons';
import {RunStateType} from "../../types/run-data.type";

const useVideoPlayer = (videoElement: React.MutableRefObject<HTMLVideoElement | null>, states?: RunStateType[]) => {
    const [playerState, setPlayerState] = useState({
        isPlaying: false,
        progress: 0,
        speed: 1,
        isMuted: false,
    });
    const [buffering, setBuffering] = useState(false);

    const togglePlay = () => {
        setPlayerState({
            ...playerState,
            isPlaying: false,
            progress: 0
        });
        setBuffering(false);
        videoElement.current!.currentTime = 0;
        videoElement.current!.pause();

        if (!playerState.isPlaying) {
            states && states.forEach(state => {

                setTimeout(() => {
                    switch (state.state) {
                        case "State.BUFFERING":
                            videoElement.current!.pause();
                            setPlayerState({...playerState});
                            setBuffering(true);
                            break;
                        case "State.READY":
                            setPlayerState({
                                ...playerState,
                                isPlaying: true,
                            });
                            setBuffering(false);
                            videoElement.current!.play();
                            break;
                    }
                }, state.time * 1000);

            })
        }
    };

    const handleOnTimeUpdate = () => {
        const progress = (videoElement.current!.currentTime / videoElement.current!.duration) * 100;
        setPlayerState({
            ...playerState,
            progress,
        });
    };

    const handleVideoProgress = (event: any) => {
        const manualChange = Number(event.target.value);
        videoElement.current!.currentTime = (videoElement.current!.duration / 100) * manualChange;
        setPlayerState({
            ...playerState,
            progress: manualChange,
        });
    };

    const handleVideoSpeed = (event: any) => {
        const speed = Number(event.target.value);
        videoElement.current!.playbackRate = speed;
        setPlayerState({
            ...playerState,
            speed,
        });
    };

    const toggleMute = () => {
        setPlayerState({
            ...playerState,
            isMuted: !playerState.isMuted,
        });
    };

    useEffect(() => {
        playerState.isMuted
            ? (videoElement.current!.muted = true)
            : (videoElement.current!.muted = false);
    }, [playerState.isMuted, videoElement]);

    return {
        playerState,
        togglePlay,
        handleOnTimeUpdate,
        handleVideoProgress,
        handleVideoSpeed,
        toggleMute,
        buffering
    };
};

export const VideoPlayer = (props: {
    src: string, states?: RunStateType[]
}) => {
    const {src, states} = props;
    const videoElement = useRef<HTMLVideoElement>(null);
    const {
        playerState,
        togglePlay,
        handleOnTimeUpdate,
        handleVideoProgress,
        handleVideoSpeed,
        toggleMute,
        buffering
    } = useVideoPlayer(videoElement, states || [{state: "State.READY", time: 0, position: 0}]);

    return <>
        <div className="video-wrapper">
            <video
                src={src}
                ref={videoElement}
                onTimeUpdate={handleOnTimeUpdate}
            />
            {
                buffering &&
                <div className="overlay">
                    Buffering ...
                </div>
            }
            <div className="controls">
                <div className="actions">
                    <button onClick={togglePlay}>
                        {!playerState.isPlaying ? (
                            <PlayCircleOutlined/>
                        ) : (
                            <FastBackwardFilled/>
                        )}
                    </button>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={playerState.progress}
                    onChange={(e) => {
                    }}
                    disabled
                />
            </div>
        </div>
    </>
}