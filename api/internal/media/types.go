package media

// Video represents the base video object
type Video struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
}

// Recording represents a recording video
type Recording struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
}

// Event represents an event video with additional type field
type Event struct {
	File      string `json:"-"`
	Timestamp string `json:"timestamp"`
	Type      string `json:"event_type"`
}
