import { useEffect } from 'react'
import Screen from './Screen'
import ClickWheel from './ClickWheel'
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation'
import { playClickSound, playSelectSound, playBackSound, initAudio } from '@/utils/sounds'
import './IPod.css'

function IPod({
  currentScreen,
  menuItems,
  selectedIndex,
  onSelect,
  onBack,
  onNext,
  onPrevious,
  onPlayPause,
  onSkipForward,
  onSkipBack,
  currentTrack,
  isPlaying,
  isLoading,
  progress,
  currentProgress,
  duration,
  volume,
  shuffleEnabled,
  repeatMode,
  onSeek,
  onToggleShuffle,
  onCycleRepeatMode,
  onVolumeChange,
  playbackError,
  playbackReady,
  searchResults,
  spotifyError,
  onSearch,
  searchMode,
  userProfile,
  onLogout,
  transitionDirection,
  theme,
  skin,
  onThemeChange,
  onSkinChange,
  soundsEnabled = true
}) {
  useEffect(() => {
    const handleFirstInteraction = () => {
      initAudio()
      window.removeEventListener('click', handleFirstInteraction)
      window.removeEventListener('keydown', handleFirstInteraction)
    }

    window.addEventListener('click', handleFirstInteraction)
    window.addEventListener('keydown', handleFirstInteraction)

    return () => {
      window.removeEventListener('click', handleFirstInteraction)
      window.removeEventListener('keydown', handleFirstInteraction)
    }
  }, [])

  const withSound = (soundFn, handler) => () => {
    if (soundsEnabled) {
      soundFn()
    }
    handler()
  }

  const handleNextWithSound = withSound(playClickSound, onNext)
  const handlePreviousWithSound = withSound(playClickSound, onPrevious)
  const handleSelectWithSound = withSound(playSelectSound, onSelect)
  const handleBackWithSound = withSound(playBackSound, onBack)

  useKeyboardNavigation({
    onNext: handleNextWithSound,
    onPrevious: handlePreviousWithSound,
    onSelect: handleSelectWithSound,
    onBack: handleBackWithSound,
    onPlayPause,
    onSkipForward,
    onSkipBack,
    onToggleShuffle,
    onCycleRepeatMode,
    onVolumeChange,
    volume
  })

  return (
    <div className={`ipod theme-${theme} skin-${skin}`}>
      <div className="ipod-shell">
        <Screen
          currentScreen={currentScreen}
          menuItems={menuItems}
          selectedIndex={selectedIndex}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          progress={progress}
          currentProgress={currentProgress}
          duration={duration}
          volume={volume}
          shuffleEnabled={shuffleEnabled}
          repeatMode={repeatMode}
          onSeek={onSeek}
          onToggleShuffle={onToggleShuffle}
          onCycleRepeatMode={onCycleRepeatMode}
          onVolumeChange={onVolumeChange}
          onPlayPause={onPlayPause}
          playbackError={playbackError}
          playbackReady={playbackReady}
          searchResults={searchResults}
          spotifyError={spotifyError}
          onSearch={onSearch}
          onSelect={onSelect}
          mode={searchMode}
          userProfile={userProfile}
          onLogout={onLogout}
          transitionDirection={transitionDirection}
          theme={theme}
          skin={skin}
          onThemeChange={onThemeChange}
          onSkinChange={onSkinChange}
        />
        <ClickWheel
          onSelect={handleSelectWithSound}
          onBack={handleBackWithSound}
          onNext={handleNextWithSound}
          onPrevious={handlePreviousWithSound}
          onPlayPause={onPlayPause}
          onSkipForward={onSkipForward}
          onSkipBack={onSkipBack}
        />
      </div>
    </div>
  )
}

export default IPod
