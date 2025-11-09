package logger

import (
	"log"
	"os"
	"strings"

	"github.com/vicgarcia/tapes/internal/env"
)

var (
	debugEnabled bool
	infoLogger   *log.Logger
	debugLogger  *log.Logger
	errorLogger  *log.Logger
)

func init() {
	level := strings.ToUpper(env.GetWithDefault("LOG_LEVEL", "INFO"))
	debugEnabled = level == "DEBUG"

	infoLogger = log.New(os.Stdout, "[INFO] ", log.LstdFlags)
	debugLogger = log.New(os.Stdout, "[DEBUG] ", log.LstdFlags|log.Lshortfile)
	errorLogger = log.New(os.Stderr, "[ERROR] ", log.LstdFlags|log.Lshortfile)
}

func Info(msg string) {
	infoLogger.Println(msg)
}

func Debug(msg string) {
	if debugEnabled {
		debugLogger.Println(msg)
	}
}

func Error(msg string) {
	errorLogger.Println(msg)
}
