package cameras

import (
 "fmt"
 "sort"
 "sync"
 "time"
 "github.com/vicgarcia/tapes/internal/mediamtx"
)
type Video struct { Codec string `json:"codec"`; Width int `json:"width"`; Height int `json:"height"` }
type Camera struct { Name string `json:"name"`; Online bool `json:"online"`; Video *Video `json:"video"` }
var mu sync.Mutex
var cache []Camera
var cached time.Time
func GetAll() ([]Camera,error) { mu.Lock(); defer mu.Unlock(); if time.Since(cached)<2*time.Second && cache!=nil { return append([]Camera(nil),cache...),nil }; rows,err:=mediamtx.Paths(); if err!=nil{return nil,err}; out:=make([]Camera,0,len(rows)); for _,p:=range rows { c:=Camera{Name:p.Name,Online:p.Ready}; if p.Ready && len(p.Tracks)>0 { t:=p.Tracks[0]; if t.CodecProps!=nil { c.Video=&Video{Codec:t.Codec,Width:t.CodecProps.Width,Height:t.CodecProps.Height} } }; out=append(out,c) }; sort.Slice(out,func(i,j int)bool{return out[i].Name<out[j].Name}); cache=out;cached=time.Now(); return append([]Camera(nil),out...),nil }
func GetByName(name string)(Camera,error){ all,e:=GetAll();if e!=nil{return Camera{},e};for _,c:=range all {if c.Name==name{return c,nil}};return Camera{},fmt.Errorf("unknown camera") }
