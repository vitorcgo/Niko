set pagination off
set debuginfod enabled off
set breakpoint pending on
break gst_video_format_from_string
commands
silent
printf "FORMAT_INPUT=%s\n", (char*)$rdi
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
