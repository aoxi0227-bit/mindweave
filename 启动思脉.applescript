try
	set myPath to POSIX path of (path to me)
	if myPath ends with ".app/" or myPath ends with ".app" then
		set dir to do shell script "cd " & quoted form of myPath & " 2>/dev/null; cd ../.. 2>/dev/null; pwd"
		-- resolve to the folder containing the .app
		set dir to do shell script "d=" & quoted form of myPath & "; d=${d%/}; d=${d%.app}; dirname \"$d\""
	else
		set dir to do shell script "dirname " & quoted form of myPath
	end if
on error
	set dir to do shell script "pwd"
end try
do shell script "bash " & quoted form of (dir & "/启动思脉.sh")
