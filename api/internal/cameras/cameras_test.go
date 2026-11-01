package cameras
import "testing"
func TestCameraJSONFields(t *testing.T){ c:=Camera{Name:"x",Online:true,Video:&Video{Codec:"H264",Width:640,Height:360}};if c.Name!="x"||!c.Online||c.Video.Width!=640{t.Fatal(c)} }
