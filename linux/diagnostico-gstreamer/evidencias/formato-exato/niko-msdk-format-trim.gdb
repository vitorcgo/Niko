set pagination off
set debuginfod enabled off
set breakpoint pending on
break gst_video_format_from_string
commands
silent
printf "FORMAT_INPUT=%s\n", (char*)$rdi
if *(char*)$rdi == 32 && *(char*)($rdi+1) == 86 && *(char*)($rdi+2) == 85
set $rdi = $rdi + 1
printf "DIAGNOSTIC_TRIMMED_INPUT=%s\n", (char*)$rdi
end
continue
end
break g_return_if_fail_warning
commands
silent
printf "ASSERT_FUNCTION=%s ASSERT_EXPR=%s\n", (char*)$rsi, (char*)$rdx
bt 8
quit
end
run
