on run
	try
		set myPosix to POSIX path of (path to me)
	on error
		set myPosix to ""
	end try
	try
		set dir to do shell script "p=" & quoted form of myPosix & "; p=${p%/}; p=${p%.app}; d=$(dirname \"$p\"); if [ -f \"$d/启动思脉.sh\" ]; then printf '%s' \"$d\"; elif [ -f \"$p/启动思脉.sh\" ]; then printf '%s' \"$p\"; else printf '%s' \"$d\"; fi"
	on error
		set dir to ""
	end try
	set logFile to "/tmp/mindweave-launcher.log"
	try
		do shell script "echo '--- launch ' $(date) '---' >> " & logFile & "; echo 'pathToMe=" & myPosix & "' >> " & logFile & "; echo 'dir=" & dir & "' >> " & logFile
	on error
	end try
	if dir is "" then
		try
			do shell script "echo 'ERROR: empty dir' >> " & logFile
			display dialog "思脉MindWeave 无法定位项目目录。" & return & "请把本 .app 放在 mindweave.html / server.js 同一文件夹内。" & return & return & "详见 " & logFile buttons {"好"} default button 1 with title "思脉MindWeave" with icon stop
		end try
		return
	end if
	try
		do shell script "bash " & quoted form of (dir & "/启动思脉.sh") & " >> " & logFile & " 2>&1"
	on error errMsg
		try
			do shell script "echo 'ERROR: " & errMsg & "' >> " & logFile
			display dialog "启动后台失败：" & errMsg & return & return & "详见 " & logFile buttons {"好"} default button 1 with title "思脉MindWeave" with icon stop
		end try
	end try
end run
