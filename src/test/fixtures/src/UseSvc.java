package demo;
import org.springframework.security.access.prepost.PreAuthorize;

public class UseSvc {
    @PreAuthorize("@svcService.userHasGroup('A')")
    public void doIt() {}
}
